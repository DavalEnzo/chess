// ===========================
// INITIALISATION SOCKET.IO
// ===========================

// Établit la connexion avec le serveur
const socket = io();

// ===========================
// GESTION DES SONS
// ===========================

// Objet pour créer et jouer les sons
const soundManager = {
    sounds: {
        move: new Audio('/sounds/move-self.mp3'),
        capture: new Audio('/sounds/capture.mp3'),
        illegal: new Audio('/sounds/illegal.mp3'),
        tenseconds: new Audio('/sounds/tenseconds.mp3'),
        gameStart: new Audio('/sounds/game-start.mp3')
    },
    
    play(soundName) {
        try {
            if (this.sounds[soundName]) {
                // Réinitialiser le son pour pouvoir le rejouer immédiatement
                this.sounds[soundName].currentTime = 0;
                this.sounds[soundName].play().catch(err => {
                    console.log('Erreur lors de la lecture du son:', err);
                });
            }
        } catch (error) {
            console.log('Erreur son:', error);
        }
    },
    
    playMove() {
        this.play('move');
    },
    
    playCapture() {
        this.play('capture');
    },
    
    playIllegal() {
        this.play('illegal');
    },
    
    playTenSeconds() {
        this.play('tenseconds');
    },
    
    playGameStart() {
        this.play('gameStart');
    }
};

// Symboles Unicode des pièces
const PIECES = {
    'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔',
    'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚'
};

// Plateau initial
const INITIAL_BOARD = [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
];

// État du jeu local
const gameState = {
    gameId: null,
    color: null, // 'white' ou 'black'
    board: JSON.parse(JSON.stringify(INITIAL_BOARD)),
    currentPlayer: 'white',
    selectedSquare: null,
    possibleMoves: [],
    history: [],
    status: 'connecting', // 'connecting', 'waiting', 'active', 'ended', 'local'
    isLocalGame: false, // true pour le mode local
    socket: null, // connecté au serveur ou null pour local
    isPrivateRoom: false, // true si c'est une partie privée
    privateRoomCode: null, // code du salon privé
    yourELO: 0, // ELO du joueur
    opponentELO: 0, // ELO de l'adversaire
    playerPseudo: null, // pseudo du joueur
    opponentPseudo: 'Adversaire' // pseudo de l'adversaire
};

/**
 * Affiche une modal de confirmation non-bloquante
 */
function showConfirmModal(message, onYes, onNo) {
    const modal = document.getElementById('confirmModal');
    const messageEl = document.getElementById('confirmMessage');
    const yesBtn = document.getElementById('confirmYes');
    const noBtn = document.getElementById('confirmNo');
    
    messageEl.textContent = message;
    modal.classList.add('show');
    
    const handleYes = () => {
        modal.classList.remove('show');
        yesBtn.removeEventListener('click', handleYes);
        noBtn.removeEventListener('click', handleNo);
        if (onYes) onYes();
    };
    
    const handleNo = () => {
        modal.classList.remove('show');
        yesBtn.removeEventListener('click', handleYes);
        noBtn.removeEventListener('click', handleNo);
        if (onNo) onNo();
    };
    
    yesBtn.addEventListener('click', handleYes);
    noBtn.addEventListener('click', handleNo);
}

// ===========================
// GESTION DES ÉCRANS
// ===========================

/**
 * Affiche un écran spécifique
 */
function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenName).classList.add('active');
}

/**
 * Affiche une notification
 */
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification show ${type}`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 4000);
}

// ===========================
// ÉVÉNEMENTS SOCKET.IO - CONNEXION
// ===========================

/**
 * Connexion établie avec le serveur
 */
socket.on('connect', () => {
    console.log('✓ Connecté au serveur');
    // N'affiche PAS le matching screen ici - on laisse le pseudo screen visible
});

/**
 * Erreur de connexion
 */
socket.on('error', (error) => {
    console.error('Erreur Socket.io:', error);
    showNotification('Erreur de connexion', 'error');
});

/**
 * Déconnexion du serveur
 */
socket.on('disconnect', () => {
    console.log('✗ Déconnecté du serveur');
    showNotification('Vous avez été déconnecté', 'error');
    showScreen('pseudoScreen');
});

// ===========================
// ÉVÉNEMENTS SOCKET.IO - MATCHING
// ===========================

/**
 * En attente d'un adversaire
 */
socket.on('waiting', (data) => {
    console.log('En attente d\'un adversaire...');
    gameState.status = 'waiting';
    showScreen('waitingScreen');
    showNotification(data.message, 'info');
});

/**
 * Partie commencée - adversaire trouvé
 */
socket.on('gameStart', (data) => {
    console.log(`Partie commencée! Vous êtes ${data.color}`);
    
    gameState.gameId = data.gameId;
    gameState.color = data.color;
    gameState.board = JSON.parse(JSON.stringify(data.board));
    gameState.currentPlayer = data.currentPlayer;
    gameState.status = 'active';
    gameState.isLocalGame = false;
    gameState.yourELO = data.yourELO || 0;
    gameState.opponentELO = data.opponentELO || 0;
    gameState.opponentPseudo = data.opponentPseudo || 'Adversaire';
    gameState.selectedSquare = null;
    gameState.possibleMoves = [];
    gameState.history = [];

    // Met à jour l'affichage des noms et ELO
    updatePlayerDisplay();

    // Affiche le jeu
    showScreen('gameScreen');
    renderBoard();
    updateGameDisplay();
    updateTimerClasses();
    startTimer();
    
    // Son de démarrage
    soundManager.playGameStart();
    
    const playerColor = data.color === 'white' ? 'blancs' : 'noirs';
    showNotification(`Partie commencée! Vous jouez les ${playerColor}`, 'success');
});

// ===========================
// ÉVÉNEMENTS SOCKET.IO - MOUVEMENTS
// ===========================

/**
 * Mise à jour du jeu après un coup
 */
socket.on('moveUpdate', (data) => {
    console.log(`Coup reçu: ${data.moveNotation}`);
    
    gameState.board = JSON.parse(JSON.stringify(data.board));
    gameState.currentPlayer = data.currentPlayer;
    gameState.history = data.history;
    gameState.selectedSquare = null;
    gameState.possibleMoves = [];

    // Joue le son du coup de l'adversaire
    if (data.moveNotation.includes('x')) {
        // Capture
        soundManager.playCapture();
    } else {
        // Coup normal
        soundManager.playMove();
    }

    renderBoard();
    updateGameDisplay();
});

/**
 * Coup illégal rejeté par le serveur
 */
socket.on('invalidMove', (data) => {
    console.error('Coup illégal:', data.message);
    showNotification(data.message, 'error');
    soundManager.playIllegal();
    gameState.selectedSquare = null;
    gameState.possibleMoves = [];
    renderBoard();
});

// ===========================
// ÉVÉNEMENTS SOCKET.IO - FIN DE PARTIE
// ===========================

/**
 * Partie terminée
 */
socket.on('gameEnd', (data) => {
    console.log(`Partie terminée: ${data.status} - ${data.winner}`);
    
    stopTimer();
    gameState.status = 'ended';
    
    document.getElementById('gameEndTitle').textContent = 'Partie Terminée';
    document.getElementById('gameEndMessage').textContent = data.message;
    
    // Mets à jour les ELO s'ils sont fournis
    if (data.winnerELO && data.loserELO) {
        if (data.winner === gameState.color) {
            gameState.yourELO = data.winnerELO;
            gameState.opponentELO = data.loserELO;
        } else {
            gameState.yourELO = data.loserELO;
            gameState.opponentELO = data.winnerELO;
        }
    }
    
    if (data.winner === gameState.color) {
        document.getElementById('gameEndTitle').innerHTML = '🎉 Vous avez gagné ! 🎉';
        showNotification('Félicitations, vous avez gagné!', 'success');
    } else {
        document.getElementById('gameEndTitle').innerHTML = '😢 Vous avez perdu';
        showNotification('Vous avez perdu cette partie', 'error');
    }
    
    showScreen('gameEndScreen');
});

/**
 * L'adversaire s'est déconnecté
 */
socket.on('opponentDisconnected', (data) => {
    console.log('L\'adversaire s\'est déconnecté');
    gameState.status = 'ended';
    
    document.getElementById('gameEndTitle').innerHTML = '🎉 Vous avez gagné ! 🎉';
    document.getElementById('gameEndMessage').textContent = data.message;
    
    showScreen('gameEndScreen');
    showNotification(data.message, 'success');
});

/**
 * Salon privé créé avec succès
 */
socket.on('privateRoomCreated', (data) => {
    console.log('Salon créé avec le code:', data.code);
    document.getElementById('roomCodeDisplay').textContent = data.code;
    document.getElementById('createdRoomInfo').style.display = 'block';
    document.getElementById('createRoomBtn').disabled = true;
    gameState.gameId = data.gameId;
    gameState.privateRoomCode = data.code;
});

/**
 * Salon privé fermé/partie commencée
 */
socket.on('privateGameStart', (data) => {
    console.log('Partie commencée dans le salon privé');
    gameState.gameId = data.gameId;
    gameState.color = data.color;
    gameState.board = JSON.parse(JSON.stringify(data.board));
    gameState.currentPlayer = data.currentPlayer;
    gameState.status = 'active';
    gameState.isLocalGame = false;
    gameState.isPrivateRoom = true;
    gameState.yourELO = data.yourELO || 0;
    gameState.opponentELO = data.opponentELO || 0;
    gameState.opponentPseudo = data.opponentPseudo || 'Adversaire';
    gameState.selectedSquare = null;
    gameState.possibleMoves = [];
    gameState.history = [];

    // Met à jour l'affichage des noms et ELO
    updatePlayerDisplay();

    showScreen('gameScreen');
    renderBoard();
    updateGameDisplay();
    updateTimerClasses();
    startTimer();
    
    // Son de démarrage
    soundManager.playGameStart();
    
    const playerColor = data.color === 'white' ? 'blancs' : 'noirs';
    showNotification(`Partie commencée! Vous jouez les ${playerColor}`, 'success');
});

/**
 * Erreur lors de la création/connexion au salon
 */
socket.on('privateRoomError', (data) => {
    console.error('Erreur salon privé:', data.message);
    showNotification(data.message, 'error');
    document.getElementById('createRoomBtn').disabled = false;
});

/**
 * Partie privée relancée
 */
socket.on('privateRematchStart', (data) => {
    console.log('Partie privée relancée');
    gameState.gameId = data.gameId;
    gameState.color = data.color;
    gameState.board = JSON.parse(JSON.stringify(data.board));
    gameState.currentPlayer = data.currentPlayer;
    gameState.status = 'active';
    gameState.yourELO = data.yourELO || 0;
    gameState.opponentELO = data.opponentELO || 0;
    gameState.opponentPseudo = data.opponentPseudo || 'Adversaire';
    gameState.selectedSquare = null;
    gameState.possibleMoves = [];
    gameState.history = [];

    // Met à jour l'affichage des noms et ELO
    updatePlayerDisplay();

    showScreen('gameScreen');
    renderBoard();
    updateGameDisplay();
    updateTimerClasses();
    startTimer();
    
    // Son de démarrage
    soundManager.playGameStart();
    
    showNotification('Nouvelle partie commencée!', 'success');
});

// ===========================
// RENDU DE L'INTERFACE
// ===========================

/**
 * Affiche le plateau
 */
function renderBoard() {
    const boardElement = document.getElementById('board');
    boardElement.innerHTML = '';

    // Si le joueur joue les Noirs, inverser le plateau
    const startRow = gameState.color === 'black' ? 7 : 0;
    const endRow = gameState.color === 'black' ? -1 : 8;
    const rowStep = gameState.color === 'black' ? -1 : 1;

    const startCol = gameState.color === 'black' ? 7 : 0;
    const endCol = gameState.color === 'black' ? -1 : 8;
    const colStep = gameState.color === 'black' ? -1 : 1;

    for (let row = startRow; row !== endRow; row += rowStep) {
        for (let col = startCol; col !== endCol; col += colStep) {
            const square = createSquareElement(row, col);
            boardElement.appendChild(square);
        }
    }
}

/**
 * Crée un élément de case
 */
function createSquareElement(row, col) {
    const square = document.createElement('div');
    square.className = 'square';
    square.id = `square-${row}-${col}`;

    // Couleur alternée
    if ((row + col) % 2 === 0) {
        square.classList.add('white');
    } else {
        square.classList.add('black');
    }

    // Ajoute la pièce
    const piece = gameState.board[row][col];
    if (piece) {
        const pieceElement = document.createElement('span');
        pieceElement.className = 'piece';
        pieceElement.textContent = PIECES[piece];
        square.appendChild(pieceElement);
    }

    // Sélection et coups possibles
    if (gameState.selectedSquare && gameState.selectedSquare.row === row && gameState.selectedSquare.col === col) {
        square.classList.add('selected');
    }

    if (gameState.possibleMoves.some(move => move.row === row && move.col === col)) {
        if (piece) {
            square.classList.add('possible-capture');
        } else {
            square.classList.add('possible-move');
        }
    }

    // Clic sur la case
    // En mode local ou quand une partie est active, on peut toujours cliquer
    // (la vérification du tour se fait dans onSquareClick)
    if (gameState.isLocalGame || gameState.status === 'active') {
        square.addEventListener('click', () => onSquareClick(row, col));
    }

    return square;
}

/**
 * Met à jour l'affichage du jeu
 */
/**
 * Met à jour l'affichage des noms et ELO des joueurs
 */
function updatePlayerDisplay() {
    // Mise à jour des noms de joueurs - En haut l'adversaire, en bas le joueur
    const opponentName = document.getElementById('opponentName');
    const playerName = document.getElementById('playerName');
    const opponentELO = document.getElementById('opponentELO');
    const playerELO = document.getElementById('playerELO');
    
    // Affichage du pseudo du joueur en bas
    if (playerName) playerName.textContent = gameState.playerPseudo || 'Vous';
    if (playerELO) playerELO.textContent = `(${gameState.yourELO})`;
    
    // Affichage du pseudo de l'adversaire en haut
    if (opponentName) opponentName.textContent = gameState.opponentPseudo;
    if (opponentELO) opponentELO.textContent = `(${gameState.opponentELO})`;
}

function updateGameDisplay() {
    // Joueur au trait
    const playerTurnElement = document.getElementById('playerTurn');
    if (playerTurnElement) {
        const playerColor = gameState.currentPlayer === 'white' ? 'Blancs' : 'Noirs';
        playerTurnElement.textContent = `Au trait : ${playerColor}`;
        if (playerTurnElement.parentElement) {
            playerTurnElement.parentElement.classList.remove('black', 'white');
            playerTurnElement.parentElement.classList.add(gameState.currentPlayer);
        }
    }

    // Historique des coups
    updateMoveHistory();

    // Désactive les boutons si ce n'est pas notre tour
    const canPlay = gameState.status === 'active' && gameState.currentPlayer === gameState.color;
    const resignBtn = document.getElementById('resignBtn');
    const drawBtn = document.getElementById('drawBtn');
    if (resignBtn) resignBtn.disabled = !canPlay;
    if (drawBtn) drawBtn.disabled = !canPlay;
}

/**
 * Met à jour les classes des timers pour positionner le compteur du joueur en bas et l'adversaire en haut
 */
function updateTimerClasses() {
    const blackTimerCard = document.getElementById('blackTimerCard');
    const whiteTimerCard = document.getElementById('whiteTimerCard');
    
    if (!blackTimerCard || !whiteTimerCard) return;
    
    // Réinitialiser les classes
    blackTimerCard.classList.remove('own-timer', 'opponent-timer');
    whiteTimerCard.classList.remove('own-timer', 'opponent-timer');
    
    // Ajouter les classes en fonction de la couleur du joueur
    if (gameState.color === 'white') {
        whiteTimerCard.classList.add('own-timer');
        blackTimerCard.classList.add('opponent-timer');
    } else {
        blackTimerCard.classList.add('own-timer');
        whiteTimerCard.classList.add('opponent-timer');
    }
}

/**
 * Met à jour l'historique des coups
 */
function updateMoveHistory() {
    const historyContainer = document.getElementById('movesHistory');

    if (gameState.history.length === 0) {
        historyContainer.innerHTML = '<p class="empty-history">Aucun coup joué</p>';
        return;
    }

    historyContainer.innerHTML = '';

    // Grouper les coups par tour (blanc + noir)
    for (let i = 0; i < gameState.history.length; i += 2) {
        const moveItem = document.createElement('div');
        moveItem.className = 'move-item-tour';
        
        const moveNumber = Math.floor(i / 2) + 1;
        let whiteMove = gameState.history[i];
        let blackMove = gameState.history[i + 1];
        
        // Remplacer [CAPTURE] par une image
        const replaceCapture = (move) => move.replace('[CAPTURE]', '<img src="/icons/fangs.png" class="capture-icon" alt="capture" />');
        whiteMove = replaceCapture(whiteMove);
        if (blackMove) {
            blackMove = replaceCapture(blackMove);
        }
        
        let html = `<span class="move-number">${moveNumber}.</span>`;
        
        // Coup blanc
        html += ` <span class="white-move-text">${whiteMove}</span>`;
        
        // Coup noir (s'il existe)
        if (blackMove) {
            html += ` <span class="black-move-text">${blackMove}</span>`;
        }
        
        moveItem.innerHTML = html;
        historyContainer.appendChild(moveItem);
    }

    historyContainer.scrollTop = historyContainer.scrollHeight;
}

// ===========================
// MODE LOCAL (2 joueurs sur un ordinateur)
// ===========================

/**
 * Démarre une partie locale
 */
function startLocalGame() {
    console.log('Démarrage du mode local');
    gameState.isLocalGame = true;
    gameState.status = 'local';
    gameState.color = 'white'; // Le premier joueur est blanc
    gameState.currentPlayer = 'white';
    gameState.board = JSON.parse(JSON.stringify(INITIAL_BOARD));
    gameState.history = [];
    gameState.selectedSquare = null;
    gameState.possibleMoves = [];
    gameState.gameId = null;

    showScreen('gameScreen');
    renderBoard();
    updateGameDisplay();
    updateTimerClasses();
    startTimer();
}

// ===========================
// GESTION DES CLICS
// ===========================

/**
 * Clic sur une case de l'échiquier
 */
function onSquareClick(row, col) {
    const piece = gameState.board[row][col];
    
    console.log(`[Click] Row: ${row}, Col: ${col}, Piece: ${piece}, IsLocal: ${gameState.isLocalGame}, CurrentPlayer: ${gameState.currentPlayer}, MyColor: ${gameState.color}, Status: ${gameState.status}`);

    // En mode multijoueur, vérifier qu'on ne peut jouer que quand c'est notre tour
    if (!gameState.isLocalGame && gameState.currentPlayer !== gameState.color) {
        console.log(`[Click] Pas notre tour: currentPlayer=${gameState.currentPlayer}, color=${gameState.color}`);
        showNotification('Ce n\'est pas votre tour!', 'error');
        return;
    }

    // En mode multijoueur, on ne peut que bouger NOS pièces (notre couleur)
    // En mode local, on bouge les pièces du joueur actuel
    const canSelectPiece = gameState.isLocalGame 
        ? isPieceOfCurrentColor(piece, gameState.currentPlayer)  // Mode local : pièces du joueur actuel
        : isPieceOfCurrentColor(piece, gameState.color);         // Multijoueur : nos pièces
    
    console.log(`[Click] CanSelectPiece: ${canSelectPiece}, Piece: ${piece}`);

    // Si une case est déjà sélectionnée
    if (gameState.selectedSquare) {
        // Même case : désélectionner
        if (gameState.selectedSquare.row === row && gameState.selectedSquare.col === col) {
            gameState.selectedSquare = null;
            gameState.possibleMoves = [];
            renderBoard();
            return;
        }

        // Coup dans les coups possibles : jouer
        if (gameState.possibleMoves.some(move => move.row === row && move.col === col)) {
            playMove(gameState.selectedSquare.row, gameState.selectedSquare.col, row, col);
            return;
        }

        // Nouvelle pièce : changer la sélection
        if (piece && canSelectPiece) {
            gameState.selectedSquare = { row, col };
            gameState.possibleMoves = getValidMovesForDisplay(row, col);
            renderBoard();
            return;
        }

        // Sinon : désélectionner
        gameState.selectedSquare = null;
        gameState.possibleMoves = [];
        renderBoard();
        return;
    }

    // Aucune sélection : sélectionner si c'est une pièce valide
    if (piece && canSelectPiece) {
        console.log(`[Click] Sélection de la pièce ${piece}`);
        gameState.selectedSquare = { row, col };
        gameState.possibleMoves = getValidMovesForDisplay(row, col);
        renderBoard();
    } else {
        console.log(`[Click] Impossible de sélectionner - piece: ${piece}, canSelect: ${canSelectPiece}`);
    }
}

/**
 * Vérifie si une pièce appartient à une couleur donnée
 */
function isPieceOfCurrentColor(piece, playerColor) {
    if (!piece) return false; // Pas de pièce
    const isWhitePiece = piece === piece.toUpperCase();
    return (playerColor === 'white' && isWhitePiece) || (playerColor === 'black' && !isWhitePiece);
}

/**
 * Joue un coup
 */
function playMove(fromRow, fromCol, toRow, toCol) {
    if (gameState.isLocalGame) {
        // Mode local : exécute le coup directement
        playLocalMove(fromRow, fromCol, toRow, toCol);
    } else {
        // Mode multijoueur : envoie au serveur
        socket.emit('move', {
            fromRow,
            fromCol,
            toRow,
            toCol
        });
    }
}

/**
 * Joue un coup en mode local
 */
function playLocalMove(fromRow, fromCol, toRow, toCol) {
    // Valide le coup
    const piece = gameState.board[fromRow][fromCol];
    const validMoves = getValidMovesForDisplay(fromRow, fromCol);

    if (!validMoves.some(move => move.row === toRow && move.col === toCol)) {
        showNotification('Coup illégal!', 'error');
        soundManager.playIllegal();
        return;
    }

    // Exécute le coup
    const capturedPiece = gameState.board[toRow][toCol];
    gameState.board[toRow][toCol] = piece;
    gameState.board[fromRow][fromCol] = null;

    // Joue le son approprié
    if (capturedPiece) {
        soundManager.playCapture();
    } else {
        soundManager.playMove();
    }

    // Crée la notation
    const moveNotation = createMoveNotation(fromRow, fromCol, toRow, toCol, piece, capturedPiece);
    gameState.history.push(moveNotation);

    // Change le joueur
    gameState.currentPlayer = gameState.currentPlayer === 'white' ? 'black' : 'white';
    gameState.color = gameState.currentPlayer === 'white' ? 'white' : 'black';

    // Désélectionne
    gameState.selectedSquare = null;
    gameState.possibleMoves = [];

    // Met à jour l'affichage
    renderBoard();
    updateGameDisplay();
}

/**
 * Crée une notation pour un coup
 */
function createMoveNotation(fromRow, fromCol, toRow, toCol, piece, capturedPiece) {
    const pieceNames = {
        'p': 'Pion', 'n': 'Cavalier', 'b': 'Fou', 'r': 'Tour', 'q': 'Dame', 'k': 'Roi'
    };

    const pieceName = pieceNames[piece.toLowerCase()];
    const fromSquare = getSquareName(fromRow, fromCol);
    const toSquare = getSquareName(toRow, toCol);

    let notation = `${pieceName} ${fromSquare} → ${toSquare}`;

    if (capturedPiece) {
        const capturedName = pieceNames[capturedPiece.toLowerCase()];
        notation += ` [CAPTURE] ${capturedName}`;
    }

    return notation;
}

/**
 * Convertit les coordonnées en notation d'échiquier
 */
function getSquareName(row, col) {
    const file = String.fromCharCode(97 + col);
    const rank = 8 - row;
    return file + rank;
}

// ===========================
// LOGIQUE DE COUPS (AFFICHAGE UNIQUEMENT)
// ===========================

/**
 * Obtient les coups valides pour affichage (côté client)
 */
function getValidMovesForDisplay(row, col) {
    const piece = gameState.board[row][col];
    if (!piece) return [];

    const pieceLower = piece.toLowerCase();
    let moves = [];

    switch (pieceLower) {
        case 'p':
            moves = getPawnMoves(row, col, piece);
            break;
        case 'n':
            moves = getKnightMoves(row, col, piece);
            break;
        case 'b':
            moves = getBishopMoves(row, col, piece);
            break;
        case 'r':
            moves = getRookMoves(row, col, piece);
            break;
        case 'q':
            moves = getQueenMoves(row, col, piece);
            break;
        case 'k':
            moves = getKingMoves(row, col, piece);
            break;
    }

    return moves;
}

/**
 * Coups du pion
 */
function getPawnMoves(row, col, piece) {
    const moves = [];
    const isWhite = piece === piece.toUpperCase();
    const direction = isWhite ? -1 : 1;
    const startRow = isWhite ? 6 : 1;

    const nextRow = row + direction;
    if (isValidPosition(nextRow, col) && !gameState.board[nextRow][col]) {
        moves.push({ row: nextRow, col });

        if (row === startRow) {
            const twoRowsAhead = row + 2 * direction;
            if (!gameState.board[twoRowsAhead][col]) {
                moves.push({ row: twoRowsAhead, col });
            }
        }
    }

    const captureCols = [col - 1, col + 1];
    for (const captureCol of captureCols) {
        const captureRow = row + direction;
        if (isValidPosition(captureRow, captureCol)) {
            const targetPiece = gameState.board[captureRow][captureCol];
            if (targetPiece && !isPieceSameColor(piece, targetPiece)) {
                moves.push({ row: captureRow, col: captureCol });
            }
        }
    }

    return moves;
}

/**
 * Coups du cavalier
 */
function getKnightMoves(row, col, piece) {
    const moves = [];
    const knightMoves = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
    ];

    for (const [dRow, dCol] of knightMoves) {
        const newRow = row + dRow;
        const newCol = col + dCol;

        if (isValidPosition(newRow, newCol)) {
            const targetPiece = gameState.board[newRow][newCol];
            if (!targetPiece || !isPieceSameColor(piece, targetPiece)) {
                moves.push({ row: newRow, col: newCol });
            }
        }
    }

    return moves;
}

/**
 * Coups du fou
 */
function getBishopMoves(row, col, piece) {
    const moves = [];
    const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    for (const [dRow, dCol] of directions) {
        addSlidingMoves(row, col, piece, dRow, dCol, moves);
    }

    return moves;
}

/**
 * Coups de la tour
 */
function getRookMoves(row, col, piece) {
    const moves = [];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    for (const [dRow, dCol] of directions) {
        addSlidingMoves(row, col, piece, dRow, dCol, moves);
    }

    return moves;
}

/**
 * Coups de la dame
 */
function getQueenMoves(row, col, piece) {
    const moves = [];
    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];

    for (const [dRow, dCol] of directions) {
        addSlidingMoves(row, col, piece, dRow, dCol, moves);
    }

    return moves;
}

/**
 * Coups du roi
 */
function getKingMoves(row, col, piece) {
    const moves = [];
    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];

    for (const [dRow, dCol] of directions) {
        const newRow = row + dRow;
        const newCol = col + dCol;

        if (isValidPosition(newRow, newCol)) {
            const targetPiece = gameState.board[newRow][newCol];
            if (!targetPiece || !isPieceSameColor(piece, targetPiece)) {
                moves.push({ row: newRow, col: newCol });
            }
        }
    }

    return moves;
}

/**
 * Ajoute les coups de glissement
 */
function addSlidingMoves(row, col, piece, dRow, dCol, moves) {
    let currentRow = row + dRow;
    let currentCol = col + dCol;

    while (isValidPosition(currentRow, currentCol)) {
        const targetPiece = gameState.board[currentRow][currentCol];

        if (!targetPiece) {
            moves.push({ row: currentRow, col: currentCol });
        } else {
            if (!isPieceSameColor(piece, targetPiece)) {
                moves.push({ row: currentRow, col: currentCol });
            }
            break;
        }

        currentRow += dRow;
        currentCol += dCol;
    }
}

/**
 * Vérifie si deux pièces sont de la même couleur
 */
function isPieceSameColor(piece1, piece2) {
    if (!piece1 || !piece2) return false;
    const isWhite1 = piece1 === piece1.toUpperCase();
    const isWhite2 = piece2 === piece2.toUpperCase();
    return isWhite1 === isWhite2;
}

/**
 * Vérifie si une position est valide
 */
function isValidPosition(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

// ===========================
// TIMER
// ===========================

let timerInterval = null;
const TIMER_DURATION = 600; // 10 minutes
let gameTimers = { white: TIMER_DURATION, black: TIMER_DURATION };

/**
 * Démarre le timer
 */
function startTimer() {
    gameTimers = {
        white: TIMER_DURATION,
        black: TIMER_DURATION
    };

    if (timerInterval) clearInterval(timerInterval);

    console.log('[Timer] Démarrage du timer');
    
    let tenSecondsWarningPlayed = false;
    
    timerInterval = setInterval(() => {
        if (gameState.currentPlayer === 'white') {
            gameTimers.white--;
        } else {
            gameTimers.black--;
        }

        updateTimerDisplay();

        // Log tous les 10 secondes pour debug
        if ((gameTimers.white + gameTimers.black) % 20 === 0) {
            console.log(`[Timer] Blanc: ${formatTime(gameTimers.white)}, Noir: ${formatTime(gameTimers.black)}`);
        }

        // Alerte quand il reste 10 secondes
        const currentPlayerTime = gameState.currentPlayer === 'white' ? gameTimers.white : gameTimers.black;
        if (currentPlayerTime === 10 && !tenSecondsWarningPlayed) {
            soundManager.playTenSeconds();
            tenSecondsWarningPlayed = true;
        }

        // Temps écoulé
        if (gameTimers.white <= 0 || gameTimers.black <= 0) {
            clearInterval(timerInterval);
            const loser = gameTimers.white <= 0 ? 'white' : 'black';
            console.log(`[Timer] Temps écoulé pour ${loser}`);
            endGameByTime(loser);
        }
    }, 1000);
}

/**
 * Met à jour l'affichage du timer
 */
function updateTimerDisplay() {
    const whiteTimerEl = document.getElementById('whiteTimer');
    const blackTimerEl = document.getElementById('blackTimer');
    const whiteCardEl = document.getElementById('whiteTimerCard');
    const blackCardEl = document.getElementById('blackTimerCard');
    const whiteHourglassEl = document.getElementById('whiteHourglass');
    const blackHourglassEl = document.getElementById('blackHourglass');
    
    if (!whiteTimerEl || !blackTimerEl) {
        console.error('[Timer] Éléments du timer non trouvés');
        return;
    }
    
    // Affiche les timers
    whiteTimerEl.textContent = formatTime(gameTimers['white']);
    blackTimerEl.textContent = formatTime(gameTimers['black']);
    
    // Réorganise les cartes: ma couleur en bas (order 2), adversaire en haut (order 1)
    if (gameState.color === 'black') {
        blackCardEl.style.order = '2';
        whiteCardEl.style.order = '1';
    } else {
        whiteCardEl.style.order = '2';
        blackCardEl.style.order = '1';
    }
    
    // Rend le chrono moins visible quand ce n'est pas son tour
    if (gameState.currentPlayer === 'white') {
        whiteCardEl.classList.remove('inactive-timer');
        blackCardEl.classList.add('inactive-timer');
        // Affiche le sablier pour le joueur actif
        if (whiteHourglassEl) whiteHourglassEl.classList.add('active');
        if (blackHourglassEl) blackHourglassEl.classList.remove('active');
    } else {
        blackCardEl.classList.remove('inactive-timer');
        whiteCardEl.classList.add('inactive-timer');
        // Affiche le sablier pour le joueur actif
        if (blackHourglassEl) blackHourglassEl.classList.add('active');
        if (whiteHourglassEl) whiteHourglassEl.classList.remove('active');
    }
}

/**
 * Formate le temps en MM:SS
 */
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Fin de partie par timeout
 */
/**
 * Arrête le timer
 */
function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        console.log('[Timer] Timer arrêté');
    }
}

function endGameByTime(loser) {
    stopTimer();
    const winner = loser === 'white' ? 'black' : 'white';
    const loserColor = loser === 'white' ? 'blancs' : 'noirs';
    const winnerColor = winner === 'white' ? 'blancs' : 'noirs';
    socket.emit('gameEnd', {
        status: 'timeout',
        winner,
        message: `Le temps des ${loserColor} s'est écoulé. Les ${winnerColor} ont gagné !`
    });
}

// ===========================
// BOUTONS D'ACTION
// ===========================

/**
 * Bouton : Démarrer avec pseudo
 */
document.getElementById('startBtn').addEventListener('click', () => {
    const pseudoInput = document.getElementById('pseudoInput');
    const pseudo = pseudoInput.value.trim();
    
    if (!pseudo) {
        showNotification('Veuillez entrer un pseudo', 'error');
        return;
    }
    
    if (pseudo.length > 20) {
        showNotification('Le pseudo est trop long (max 20 caractères)', 'error');
        return;
    }
    
    gameState.playerPseudo = pseudo;
    socket.emit('setPseudo', { pseudo });
    showScreen('matchingScreen');
});

/**
 * Bouton : Mode Local
 */
document.getElementById('localGameBtn').addEventListener('click', () => {
    console.log('Démarrage du mode local');
    startLocalGame();
});

/**
 * Bouton : En Ligne
 */
document.getElementById('findGameBtn').addEventListener('click', () => {
    console.log('Mode en ligne');
    showScreen('onlineScreen');
});

/**
 * Bouton : Adversaire Aléatoire
 */
document.getElementById('randomOpponentBtn').addEventListener('click', () => {
    console.log('Recherche d\'un adversaire aléatoire...');
    socket.emit('joinGame');
    showScreen('waitingScreen');
});

/**
 * Bouton : Salon Privé
 */
document.getElementById('privateRoomBtn').addEventListener('click', () => {
    console.log('Accès aux salons privés');
    showScreen('privateRoomScreen');
});

/**
 * Bouton : Retour au menu
 */
document.getElementById('backToMatchingBtn').addEventListener('click', () => {
    console.log('Retour au menu');
    showScreen('matchingScreen');
});

/**
 * Bouton : Créer un salon privé
 */
document.getElementById('createRoomBtn').addEventListener('click', () => {
    socket.emit('createPrivateRoom');
});

/**
 * Bouton : Copier le code du salon
 */
document.getElementById('copyCodeBtn').addEventListener('click', () => {
    const codeDisplay = document.getElementById('roomCodeDisplay');
    const code = codeDisplay.textContent;
    navigator.clipboard.writeText(code).then(() => {
        showNotification('Code copié!', 'success');
    });
});

/**
 * Bouton : Rejoindre un salon privé
 */
document.getElementById('joinRoomBtn').addEventListener('click', () => {
    const code = document.getElementById('roomCodeInput').value.toUpperCase();
    if (code.length !== 6) {
        showNotification('Le code doit contenir 6 caractères', 'error');
        return;
    }
    socket.emit('joinPrivateRoom', { code });
});

/**
 * Bouton : Retour au menu
 */
document.getElementById('backToMenuBtn').addEventListener('click', () => {
    // Reset du salon privé
    document.getElementById('createdRoomInfo').style.display = 'none';
    document.getElementById('createRoomBtn').disabled = false;
    document.getElementById('roomCodeDisplay').textContent = '';
    document.getElementById('roomCodeInput').value = '';
    
    showScreen('matchingScreen');
});

/**
 * Bouton : Annuler la recherche
 */
document.getElementById('cancelWaitBtn').addEventListener('click', () => {
    console.log('Annulation de la recherche');
    window.location.reload();
});

/**
 * Bouton : Abandonner
 */
document.getElementById('resignBtn').addEventListener('click', () => {
    showConfirmModal('Êtes-vous sûr de vouloir abandonner?', () => {
        if (gameState.isLocalGame) {
            stopTimer();
            showScreen('matchingScreen');
            showNotification('Partie abandonnée', 'info');
        } else {
            console.log('Abandon');
            stopTimer();
            socket.emit('resign');
        }
    });
});

/**
 * Bouton : Proposition d'égalité
 */
document.getElementById('drawBtn').addEventListener('click', () => {
    showNotification('Proposition d\'égalité envoyée (non implémentée)', 'info');
});

/**
 * Bouton : Rejouer
 */
document.getElementById('playAgainBtn').addEventListener('click', () => {
    if (gameState.isPrivateRoom) {
        console.log('Relance d\'une partie privée...');
        socket.emit('rematchPrivateRoom', {
            gameId: gameState.gameId
        });
    } else {
        console.log('Recherche d\'une nouvelle partie...');
        socket.emit('joinGame');
    }
});

/**
 * Bouton : Retour à l'accueil (fin de partie)
 */
document.getElementById('backToHomeBtn').addEventListener('click', () => {
    showScreen('matchingScreen');
    gameState = {
        board: createBoard(),
        selectedSquare: null,
        validMoves: [],
        gameId: null,
        playerId: null,
        color: null,
        turn: 'white',
        whiteTime: 600,
        blackTime: 600,
        timerInterval: null,
        isGameActive: false,
        isPrivateRoom: false,
        privateRoomCode: null,
        playerPseudo: null,
        opponentPseudo: 'Adversaire'
    };
});

// ===========================
// INITIALISATION
// ===========================

// Initialise l'affichage du board pour le matching screen
function initializeDisplay() {
    // N'initialise le board que si on est sur le game screen
    const boardElement = document.getElementById('board');
    if (boardElement) {
        renderBoard();
    }
    
    // N'initialise l'historique que s'il existe
    const historyElement = document.getElementById('movesHistory');
    if (historyElement) {
        historyElement.innerHTML = '<p class="empty-history">Aucun coup joué</p>';
    }
}

// Attend le chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
    // Le pseudoScreen est déjà actif par défaut dans le HTML
    console.log('Jeu d\'échecs multiplayer chargé - Écran de pseudo affichéé');
});
