// ===========================
// SERVEUR MULTIPLAYER ÉCHECS
// ===========================

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Configuration d'Express
app.use(express.static(path.join(__dirname, 'public')));

// Port du serveur
const PORT = process.env.PORT || 3000;

// ===========================
// STRUCTURE DES DONNÉES
// ===========================

// Stocke les games actives : { gameId: { players, board, currentPlayer, moves, history, timers } }
const games = new Map();

// Stocke les sockets des utilisateurs : { socketId: { userId, gameId } }
const users = new Map();

// Queue des joueurs en attente de matching
const waitingPlayers = [];

// Salons privés : { code: { gameId, player1SocketId, player2SocketId, board, createdAt } }
const privateRooms = new Map();

// Système d'ELO : { socketId: eloRating }
const playerELO = new Map();

// Pseudos des joueurs : { socketId: pseudo }
const playerPseudos = new Map();

// ELO par défaut pour les nouveaux joueurs
const DEFAULT_ELO = 1200;
const K_FACTOR = 32; // Facteur K pour les calculs d'ELO

// ===========================
// CONSTANTES DE JEUX D'ÉCHECS
// ===========================

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

// ===========================
// INITIALISATION DU JEU
// ===========================

/**
 * Génère un code unique pour un salon privé (6 caractères alphanumériques)
 */
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Vérifie que le code n'existe pas déjà
    if (privateRooms.has(code)) {
        return generateRoomCode();
    }
    
    return code;
}

/**
 * Obtient l'ELO d'un joueur, ou l'ELO par défaut s'il n'existe pas
 */
function getPlayerELO(socketId) {
    return playerELO.get(socketId) || DEFAULT_ELO;
}

/**
 * Calcule les nouveaux ELO après une partie
 * @param {number} eloWinner - ELO du gagnant
 * @param {number} eloLoser - ELO du perdant
 * @returns {Object} { newEloWinner, newEloLoser }
 */
function calculateNewELO(eloWinner, eloLoser) {
    // Probabilité que le gagnant gagne
    const expectedWinner = 1 / (1 + Math.pow(10, (eloLoser - eloWinner) / 400));
    // Probabilité que le perdant gagne
    const expectedLoser = 1 / (1 + Math.pow(10, (eloWinner - eloLoser) / 400));

    // Nouveau ELO du gagnant (score = 1 pour victoire)
    const newEloWinner = eloWinner + K_FACTOR * (1 - expectedWinner);
    // Nouveau ELO du perdant (score = 0 pour défaite)
    const newEloLoser = eloLoser + K_FACTOR * (0 - expectedLoser);

    return {
        newEloWinner: Math.round(newEloWinner),
        newEloLoser: Math.round(newEloLoser)
    };
}

/**
 * Calcule les points ELO potentiellement gagnes/perdus pour un joueur
 */
function getPotentialELOChange(playerElo, opponentElo) {
    const { newEloWinner } = calculateNewELO(playerElo, opponentElo);
    const { newEloLoser } = calculateNewELO(opponentElo, playerElo);

    return {
        gain: Math.max(0, newEloWinner - playerElo),
        loss: Math.max(0, playerElo - newEloLoser)
    };
}

/**
 * Envoie un message systeme de debut de partie dans le chat
 */
function sendGameStartInfoMessage(playerSocketId, gameId, opponentPseudo, playerElo, opponentElo) {
    const { gain, loss } = getPotentialELOChange(playerElo, opponentElo);

    io.to(playerSocketId).emit('chatMessage', {
        pseudo: 'Système',
        message: `Adversaire: ${opponentPseudo} (${opponentElo}) | ELO: +${gain} / -${loss}`,
        fromSelf: false,
        socketId: null,
        gameId
    });
}

/**
 * Crée une nouvelle partie
 */
function createGame(player1SocketId, player2SocketId) {
    const gameId = uuidv4();

    const game = {
        gameId,
        players: {
            white: player1SocketId,
            black: player2SocketId
        },
        board: JSON.parse(JSON.stringify(INITIAL_BOARD)),
        currentPlayer: 'white',
        moves: [],
        history: [],
        status: 'active', // 'active', 'checkmate', 'stalemate', 'draw'
        timers: {
            white: 600, // 10 minutes
            black: 600
        },
        timerInterval: null,
        lastMoveTime: Date.now(),
        enPassantTarget: null,   // { row, col } de la case en passant disponible
        castlingRights: {        // droits de roque
            white: { kingSide: true, queenSide: true },
            black: { kingSide: true, queenSide: true }
        }
    };

    games.set(gameId, game);

    // Enregistre la partie pour les deux joueurs
    users.set(player1SocketId, { gameId, color: 'white' });
    users.set(player2SocketId, { gameId, color: 'black' });

    return game;
}

/**
 * Réinitialise le plateau
 */
function resetBoard() {
    return JSON.parse(JSON.stringify(INITIAL_BOARD));
}

// ===========================
// LOGIQUE D'ÉCHECS (CÔTÉ SERVEUR)
// ===========================

/**
 * Vérifie si une position est valide
 */
function isValidPosition(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
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
 * Obtient tous les coups valides pour une pièce
 */
function getValidMoves(board, row, col, piece, gameCtx) {
    let moves = [];
    const pieceLower = piece.toLowerCase();

    switch (pieceLower) {
        case 'p':
            moves = getPawnMoves(board, row, col, piece, gameCtx);
            break;
        case 'n':
            moves = getKnightMoves(board, row, col, piece);
            break;
        case 'b':
            moves = getBishopMoves(board, row, col, piece);
            break;
        case 'r':
            moves = getRookMoves(board, row, col, piece);
            break;
        case 'q':
            moves = getQueenMoves(board, row, col, piece);
            break;
        case 'k':
            moves = getKingMoves(board, row, col, piece, gameCtx);
            break;
    }

    return moves;
}

/**
 * Coups du pion
 */
function getPawnMoves(board, row, col, piece, gameCtx) {
    const moves = [];
    const isWhite = piece === piece.toUpperCase();
    const direction = isWhite ? -1 : 1;
    const startRow = isWhite ? 6 : 1;

    const nextRow = row + direction;
    if (isValidPosition(nextRow, col) && !board[nextRow][col]) {
        moves.push({ row: nextRow, col });
        if (row === startRow) {
            const twoRowsAhead = row + 2 * direction;
            if (!board[twoRowsAhead][col]) {
                moves.push({ row: twoRowsAhead, col });
            }
        }
    }

    const captureCols = [col - 1, col + 1];
    for (const captureCol of captureCols) {
        const captureRow = row + direction;
        if (isValidPosition(captureRow, captureCol)) {
            const targetPiece = board[captureRow][captureCol];
            if (targetPiece && !isPieceSameColor(piece, targetPiece)) {
                moves.push({ row: captureRow, col: captureCol });
            }
            // Prise en passant
            if (gameCtx && gameCtx.enPassantTarget &&
                gameCtx.enPassantTarget.row === captureRow &&
                gameCtx.enPassantTarget.col === captureCol) {
                moves.push({ row: captureRow, col: captureCol, enPassant: true });
            }
        }
    }

    return moves;
}

/**
 * Coups du cavalier
 */
function getKnightMoves(board, row, col, piece) {
    const moves = [];
    const knightMoves = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
    ];

    for (const [dRow, dCol] of knightMoves) {
        const newRow = row + dRow;
        const newCol = col + dCol;

        if (isValidPosition(newRow, newCol)) {
            const targetPiece = board[newRow][newCol];
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
function getBishopMoves(board, row, col, piece) {
    const moves = [];
    const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    for (const [dRow, dCol] of directions) {
        addSlidingMoves(board, row, col, piece, dRow, dCol, moves);
    }

    return moves;
}

/**
 * Coups de la tour
 */
function getRookMoves(board, row, col, piece) {
    const moves = [];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    for (const [dRow, dCol] of directions) {
        addSlidingMoves(board, row, col, piece, dRow, dCol, moves);
    }

    return moves;
}

/**
 * Coups de la dame
 */
function getQueenMoves(board, row, col, piece) {
    const moves = [];
    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];

    for (const [dRow, dCol] of directions) {
        addSlidingMoves(board, row, col, piece, dRow, dCol, moves);
    }

    return moves;
}

/**
 * Coups du roi
 */
function getKingMoves(board, row, col, piece, gameCtx) {
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
            const targetPiece = board[newRow][newCol];
            if (!targetPiece || !isPieceSameColor(piece, targetPiece)) {
                moves.push({ row: newRow, col: newCol });
            }
        }
    }

    // Roque
    if (gameCtx) {
        const isWhite = piece === piece.toUpperCase();
        const color = isWhite ? 'white' : 'black';
        const rights = gameCtx.castlingRights[color];
        const kingRow = isWhite ? 7 : 0;

        if (row === kingRow && col === 4) {
            // Petit roque (côté roi)
            if (rights.kingSide &&
                !board[kingRow][5] && !board[kingRow][6] &&
                board[kingRow][7] === (isWhite ? 'R' : 'r')) {
                moves.push({ row: kingRow, col: 6, castling: 'kingSide' });
            }
            // Grand roque (côté dame)
            if (rights.queenSide &&
                !board[kingRow][3] && !board[kingRow][2] && !board[kingRow][1] &&
                board[kingRow][0] === (isWhite ? 'R' : 'r')) {
                moves.push({ row: kingRow, col: 2, castling: 'queenSide' });
            }
        }
    }

    return moves;
}

/**
 * Ajoute les coups de glissement (fou, tour, dame)
 */
function addSlidingMoves(board, row, col, piece, dRow, dCol, moves) {
    let currentRow = row + dRow;
    let currentCol = col + dCol;

    while (isValidPosition(currentRow, currentCol)) {
        const targetPiece = board[currentRow][currentCol];

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
 * Valide un coup
 */
function isValidMove(board, fromRow, fromCol, toRow, toCol, currentPlayer, gameCtx) {
    const piece = board[fromRow][fromCol];
    if (!piece) return false;
    const isWhitePiece = piece === piece.toUpperCase();
    if ((currentPlayer === 'white' && !isWhitePiece) || (currentPlayer === 'black' && isWhitePiece)) {
        return false;
    }
    const validMoves = getValidMoves(board, fromRow, fromCol, piece, gameCtx);
    return validMoves.some(move => move.row === toRow && move.col === toCol);
}

/**
 * Crée une notation simple du coup
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
// ÉVÉNEMENTS SOCKET.IO
// ===========================

io.on('connection', (socket) => {
    console.log(`[Connexion] Joueur connecté : ${socket.id}`);

    /**
     * Événement : Définir le pseudo du joueur
     */
    socket.on('setPseudo', (data) => {
        const pseudo = data.pseudo.substring(0, 20); // Limite à 20 caractères
        playerPseudos.set(socket.id, pseudo);
        console.log(`[setPseudo] ${socket.id} a défini le pseudo: ${pseudo}`);
    });

    /**
     * Événement : Un joueur cherche une partie
     */
    socket.on('joinGame', () => {
        console.log(`[joinGame] ${socket.id} recherche une partie`);

        // Vérifie s'il y a un joueur en attente
        if (waitingPlayers.length > 0) {
            const player1SocketId = waitingPlayers.shift();
            const player2SocketId = socket.id;

            // Crée la partie
            const game = createGame(player1SocketId, player2SocketId);

            // Joins les sockets à une room
            const socket1 = io.sockets.sockets.get(player1SocketId);
            const socket2 = io.sockets.sockets.get(player2SocketId);
            
            if (socket1) socket1.join(game.gameId);
            if (socket2) socket2.join(game.gameId);

            console.log(`[room] Joueurs rejoignent la room: ${game.gameId}`);

            // Récupère les ELO des joueurs
            const elo1 = getPlayerELO(player1SocketId);
            const elo2 = getPlayerELO(player2SocketId);

            // Récupère les pseudos
            const pseudo1 = playerPseudos.get(player1SocketId) || 'Joueur 1';
            const pseudo2 = playerPseudos.get(player2SocketId) || 'Joueur 2';

            // Notifie les deux joueurs
            io.to(player1SocketId).emit('gameStart', {
                gameId: game.gameId,
                color: 'white',
                board: game.board,
                currentPlayer: game.currentPlayer,
                yourELO: elo1,
                opponentELO: elo2,
                opponentPseudo: pseudo2
            });

            io.to(player2SocketId).emit('gameStart', {
                gameId: game.gameId,
                color: 'black',
                board: game.board,
                currentPlayer: game.currentPlayer,
                yourELO: elo2,
                opponentELO: elo1,
                opponentPseudo: pseudo1
            });

            sendGameStartInfoMessage(player1SocketId, game.gameId, pseudo2, elo1, elo2);
            sendGameStartInfoMessage(player2SocketId, game.gameId, pseudo1, elo2, elo1);

            console.log(`[gameStart] Partie créée : ${game.gameId} (${player1SocketId} vs ${player2SocketId})`);
        } else {
            // Aucun joueur en attente, ajoute ce joueur à la queue
            waitingPlayers.push(socket.id);
            socket.emit('waiting', { message: 'En attente d\'un adversaire...' });
            console.log(`[waiting] ${socket.id} ajouté à la queue d'attente`);
        }
    });

    /**
     * Événement : Un joueur joue un coup
     */
    socket.on('move', (data) => {
        const userInfo = users.get(socket.id);
        if (!userInfo) {
            socket.emit('error', { message: 'Utilisateur non trouvé' });
            return;
        }

        const { gameId } = userInfo;
        const game = games.get(gameId);

        if (!game) {
            socket.emit('error', { message: 'Partie non trouvée' });
            return;
        }

        const { fromRow, fromCol, toRow, toCol } = data;

        // Valide le coup côté serveur
        if (!isValidMove(game.board, fromRow, fromCol, toRow, toCol, game.currentPlayer, game)) {
            socket.emit('invalidMove', { message: 'Coup illégal' });
            console.log(`[invalidMove] ${socket.id} a tenté un coup illégal`);
            return;
        }

        // Exécute le coup
        const piece = game.board[fromRow][fromCol];
        let capturedPiece = game.board[toRow][toCol];
        const isWhitePiece = piece === piece.toUpperCase();

        // Prise en passant
        const validMovesForExec = getValidMoves(game.board, fromRow, fromCol, piece, game);
        const moveInfo = validMovesForExec.find(m => m.row === toRow && m.col === toCol);
        if (moveInfo && moveInfo.enPassant) {
            const direction = isWhitePiece ? 1 : -1;
            capturedPiece = game.board[toRow + direction][toCol];
            game.board[toRow + direction][toCol] = null;
        }

        // Roque : déplace aussi la tour
        if (moveInfo && moveInfo.castling) {
            const kingRow = isWhitePiece ? 7 : 0;
            if (moveInfo.castling === 'kingSide') {
                game.board[kingRow][5] = game.board[kingRow][7];
                game.board[kingRow][7] = null;
            } else {
                game.board[kingRow][3] = game.board[kingRow][0];
                game.board[kingRow][0] = null;
            }
        }

        game.board[toRow][toCol] = piece;
        game.board[fromRow][fromCol] = null;

        // Promotion du pion (auto-dame)
        let wasPromotion = false;
        if ((piece === 'P' && toRow === 0) || (piece === 'p' && toRow === 7)) {
            game.board[toRow][toCol] = isWhitePiece ? 'Q' : 'q';
            wasPromotion = true;
        }

        // Mise à jour de la cible en passant
        if (piece.toLowerCase() === 'p' && Math.abs(toRow - fromRow) === 2) {
            const epRow = isWhitePiece ? toRow + 1 : toRow - 1;
            game.enPassantTarget = { row: epRow, col: toCol };
        } else {
            game.enPassantTarget = null;
        }

        // Mise à jour des droits de roque
        const cr = game.castlingRights;
        if (piece === 'K') { cr.white.kingSide = false; cr.white.queenSide = false; }
        if (piece === 'k') { cr.black.kingSide = false; cr.black.queenSide = false; }
        if (fromRow === 7 && fromCol === 7) cr.white.kingSide = false;
        if (fromRow === 7 && fromCol === 0) cr.white.queenSide = false;
        if (fromRow === 0 && fromCol === 7) cr.black.kingSide = false;
        if (fromRow === 0 && fromCol === 0) cr.black.queenSide = false;

        // Décompte le temps écoulé depuis le dernier coup
        const now = Date.now();
        const elapsed = Math.floor((now - game.lastMoveTime) / 1000);
        game.timers[game.currentPlayer] = Math.max(0, game.timers[game.currentPlayer] - elapsed);
        game.lastMoveTime = now;

        // Vérifie le timeout
        if (game.timers[game.currentPlayer] <= 0) {
            const loser = game.currentPlayer;
            const winner = loser === 'white' ? 'black' : 'white';
            const loserFR = loser === 'white' ? 'blancs' : 'noirs';
            const winnerFR = winner === 'white' ? 'blancs' : 'noirs';
            const eloWinner = getPlayerELO(game.players[winner]);
            const eloLoser = getPlayerELO(game.players[loser]);
            const { newEloWinner, newEloLoser } = calculateNewELO(eloWinner, eloLoser);
            playerELO.set(game.players[winner], newEloWinner);
            playerELO.set(game.players[loser], newEloLoser);
            game.status = 'ended';
            io.to(game.gameId).emit('gameEnd', {
                status: 'timeout',
                winner,
                message: `Le temps des ${loserFR} s'est écoulé. Les ${winnerFR} ont gagné !`,
                winnerELO: newEloWinner,
                loserELO: newEloLoser
            });
            return;
        }

        // Crée la notation
        const moveNotation = createMoveNotation(fromRow, fromCol, toRow, toCol, piece, capturedPiece);
        game.history.push(moveNotation);

        // Change le joueur actuel
        const previousPlayer = game.currentPlayer;
        game.currentPlayer = game.currentPlayer === 'white' ? 'black' : 'white';

        console.log(`[move] ${socket.id} (${previousPlayer}) joue : ${moveNotation}`);

        // Envoie la mise à jour aux deux joueurs dans la room (timers inclus)
        io.to(game.gameId).emit('moveUpdate', {
            board: game.board,
            currentPlayer: game.currentPlayer,
            moveNotation,
            history: game.history,
            timers: game.timers,
            enPassantTarget: game.enPassantTarget,
            castlingRights: game.castlingRights,
            promotion: wasPromotion
        });
    });

    /**
     * Événement : Demande l'état actuel de la partie
     */
    socket.on('getGameState', () => {
        const userInfo = users.get(socket.id);
        if (!userInfo) return;

        const game = games.get(userInfo.gameId);
        if (!game) return;

        socket.emit('gameState', {
            board: game.board,
            currentPlayer: game.currentPlayer,
            history: game.history,
            status: game.status
        });
    });

    /**
     * Événement : Un joueur abandonne
     */
    socket.on('resign', () => {
        const userInfo = users.get(socket.id);
        if (!userInfo) return;

        const game = games.get(userInfo.gameId);
        if (!game) return;

        const winnerColor = userInfo.color === 'white' ? 'black' : 'white';
        const loserColor = userInfo.color === 'white' ? 'blancs' : 'noirs';
        const winnerColorFR = winnerColor === 'white' ? 'blancs' : 'noirs';

        // Récupère les sockets des joueurs
        const winnerSocketId = game.players[winnerColor];
        const loserSocketId = game.players[userInfo.color];

        // Calcule les nouveaux ELO
        const eloWinner = getPlayerELO(winnerSocketId);
        const eloLoser = getPlayerELO(loserSocketId);
        const { newEloWinner, newEloLoser } = calculateNewELO(eloWinner, eloLoser);

        // Met à jour les ELO
        playerELO.set(winnerSocketId, newEloWinner);
        playerELO.set(loserSocketId, newEloLoser);

        console.log(`[resign] ${socket.id} (${userInfo.color}) a abandonné`);
        console.log(`[ELO] ${winnerSocketId}: ${eloWinner} -> ${newEloWinner}, ${loserSocketId}: ${eloLoser} -> ${newEloLoser}`);

        io.to(userInfo.gameId).emit('gameEnd', {
            status: 'resignation',
            winner: winnerColor,
            message: `Les ${loserColor} ont abandonné. Les ${winnerColorFR} ont gagné !`,
            winnerELO: newEloWinner,
            loserELO: newEloLoser
        });

        // Marque la partie comme terminée
        game.status = 'ended';
    });

    /**
     * Événement : Message de chat
     */
    socket.on('chatMessage', (data) => {
        const userInfo = users.get(socket.id);
        if (!userInfo) return;

        const game = games.get(userInfo.gameId);
        if (!game || game.status !== 'active') return;

        const pseudo = playerPseudos.get(socket.id) || 'Joueur';
        const message = String(data.message || '').trim().substring(0, 200);
        if (!message) return;

        console.log(`[chat] ${pseudo}: ${message}`);

        io.to(userInfo.gameId).emit('chatMessage', {
            pseudo,
            message,
            fromSelf: false,
            socketId: socket.id
        });
    });

    /**
     * Événement : Déconnexion
     */
    socket.on('disconnect', () => {
        console.log(`[Déconnexion] Joueur déconnecté : ${socket.id}`);

        // Nettoie le pseudo
        playerPseudos.delete(socket.id);

        // Vérifie si le joueur était en attente
        const waitingIndex = waitingPlayers.indexOf(socket.id);
        if (waitingIndex !== -1) {
            waitingPlayers.splice(waitingIndex, 1);
            console.log(`[waiting] ${socket.id} retiré de la queue d'attente`);
            return;
        }

        // Vérifie si le joueur était en partie
        const userInfo = users.get(socket.id);
        if (userInfo) {
            const game = games.get(userInfo.gameId);
            if (game && game.status === 'active') {
                const opponentColor = userInfo.color === 'white' ? 'black' : 'white';
                const opponentSocketId = game.players[opponentColor];

                io.to(opponentSocketId).emit('opponentDisconnected', {
                    message: 'L\'adversaire s\'est déconnecté. Vous avez gagné !'
                });

                console.log(`[opponentDisconnected] Adversaire de ${socket.id} notifié`);
            }

            users.delete(socket.id);
        }
    });

    /**
     * Événement : Créer un salon privé
     */
    socket.on('createPrivateRoom', () => {
        try {
            // Génère un code unique pour le salon
            const roomCode = generateRoomCode();
            
            // Crée la structure du salon
            const room = {
                code: roomCode,
                player1SocketId: socket.id,
                player2SocketId: null,
                gameId: null,
                createdAt: Date.now(),
                status: 'waiting' // 'waiting' ou 'started'
            };

            privateRooms.set(roomCode, room);

            // Rejoint la room Socket.io
            socket.join(roomCode);

            // Envoie le code au joueur 1
            socket.emit('privateRoomCreated', {
                code: roomCode,
                message: `Salon créé ! Code : ${roomCode}`
            });

            console.log(`[createPrivateRoom] ${socket.id} a créé un salon privé avec code ${roomCode}`);

            // Retire le joueur de la queue d'attente s'il y était
            const waitingIndex = waitingPlayers.indexOf(socket.id);
            if (waitingIndex !== -1) {
                waitingPlayers.splice(waitingIndex, 1);
            }
        } catch (error) {
            console.error('[createPrivateRoom] Erreur:', error);
            socket.emit('privateRoomError', {
                message: 'Erreur lors de la création du salon'
            });
        }
    });

    /**
     * Événement : Rejoindre un salon privé
     */
    socket.on('joinPrivateRoom', (data) => {
        try {
            const { code } = data;

            // Valide que le code existe
            if (!code || typeof code !== 'string' || code.length !== 6) {
                socket.emit('privateRoomError', {
                    message: 'Code invalide'
                });
                return;
            }

            // Normalise le code (uppercase)
            const normalizedCode = code.toUpperCase();

            // Vérifie que le salon existe
            if (!privateRooms.has(normalizedCode)) {
                socket.emit('privateRoomError', {
                    message: 'Salon non trouvé'
                });
                console.log(`[joinPrivateRoom] ${socket.id} a essayé de rejoindre un salon inexistant: ${normalizedCode}`);
                return;
            }

            const room = privateRooms.get(normalizedCode);

            // Vérifie que le salon n'est pas déjà complet
            if (room.player2SocketId !== null) {
                socket.emit('privateRoomError', {
                    message: 'Le salon est déjà complet'
                });
                console.log(`[joinPrivateRoom] ${socket.id} a essayé de rejoindre un salon plein: ${normalizedCode}`);
                return;
            }

            // Ajoute le joueur 2 au salon
            room.player2SocketId = socket.id;
            room.status = 'started';

            // Rejoint la room Socket.io du salon
            socket.join(normalizedCode);

            // Crée la partie de jeu
            const game = createGame(room.player1SocketId, room.player2SocketId);
            room.gameId = game.gameId;

            // Joins les deux joueurs à la room Socket.io de la partie
            const player1Socket = io.sockets.sockets.get(room.player1SocketId);
            const player2Socket = io.sockets.sockets.get(room.player2SocketId);
            if (player1Socket) player1Socket.join(game.gameId);
            if (player2Socket) player2Socket.join(game.gameId);

            console.log(`[joinPrivateRoom] ${socket.id} a rejoint le salon ${normalizedCode}. Partie lancée: ${game.gameId}`);

            // Récupère les ELO des joueurs
            const elo1 = getPlayerELO(room.player1SocketId);
            const elo2 = getPlayerELO(room.player2SocketId);

            // Récupère les pseudos
            const pseudo1 = playerPseudos.get(room.player1SocketId) || 'Joueur 1';
            const pseudo2 = playerPseudos.get(room.player2SocketId) || 'Joueur 2';

            // Notifie le joueur 1 (blancs) que la partie commence
            io.to(room.player1SocketId).emit('privateGameStart', {
                gameId: game.gameId,
                color: 'white',
                board: game.board,
                players: game.players,
                currentPlayer: game.currentPlayer,
                timers: game.timers,
                yourELO: elo1,
                opponentELO: elo2,
                opponentPseudo: pseudo2,
                message: 'La partie commence !'
            });

            // Notifie le joueur 2 (noirs) que la partie commence
            io.to(room.player2SocketId).emit('privateGameStart', {
                gameId: game.gameId,
                color: 'black',
                board: game.board,
                players: game.players,
                currentPlayer: game.currentPlayer,
                timers: game.timers,
                yourELO: elo2,
                opponentELO: elo1,
                opponentPseudo: pseudo1,
                message: 'La partie commence !'
            });

            sendGameStartInfoMessage(room.player1SocketId, game.gameId, pseudo2, elo1, elo2);
            sendGameStartInfoMessage(room.player2SocketId, game.gameId, pseudo1, elo2, elo1);

        } catch (error) {
            console.error('[joinPrivateRoom] Erreur:', error);
            socket.emit('privateRoomError', {
                message: 'Erreur lors de la connexion au salon'
            });
        }
    });

    /**
     * Événement : Relancer une partie privée
     */
    socket.on('rematchPrivateRoom', (data) => {
        try {
            const { gameId } = data;
            const game = games.get(gameId);

            if (!game) {
                socket.emit('privateRoomError', {
                    message: 'Partie introuvable'
                });
                console.log(`[rematchPrivateRoom] Partie introuvable: ${gameId}`);
                return;
            }

            // Crée une nouvelle partie entre les deux mêmes joueurs
            const player1SocketId = game.players.white;
            const player2SocketId = game.players.black;

            console.log(`[rematchPrivateRoom] Tentative de rematch pour la partie ${gameId}`);
            console.log(`[rematchPrivateRoom] Joueurs: ${player1SocketId} vs ${player2SocketId}`);

            // Vérifie que les deux joueurs sont toujours connectés
            const player1Socket = io.sockets.sockets.get(player1SocketId);
            const player2Socket = io.sockets.sockets.get(player2SocketId);

            if (!player1Socket || !player2Socket) {
                console.log(`[rematchPrivateRoom] Un joueur n'est pas connecté: P1=${player1Socket ? 'OK' : 'MISSING'}, P2=${player2Socket ? 'OK' : 'MISSING'}`);
                socket.emit('privateRoomError', {
                    message: 'Un des joueurs n\'est plus connecté'
                });
                return;
            }

            // Crée une nouvelle partie
            const newGame = createGame(player1SocketId, player2SocketId);

            console.log(`[rematchPrivateRoom] Nouvelle partie créée: ${newGame.gameId}`);

            // Quitte l'ancienne room et rejoint la nouvelle
            player1Socket.leave(gameId);
            player2Socket.leave(gameId);
            
            player1Socket.join(newGame.gameId);
            player2Socket.join(newGame.gameId);

            console.log(`[rematchPrivateRoom] Joueurs rejoints à la nouvelle room ${newGame.gameId}`);

            // Récupère les ELO des joueurs
            const elo1 = getPlayerELO(player1SocketId);
            const elo2 = getPlayerELO(player2SocketId);
            
            // Récupère les pseudos
            const pseudo1 = playerPseudos.get(player1SocketId) || 'Joueur 1';
            const pseudo2 = playerPseudos.get(player2SocketId) || 'Joueur 2';

            // Notifie les deux joueurs que la nouvelle partie commence
            player1Socket.emit('privateRematchStart', {
                gameId: newGame.gameId,
                color: 'white',
                board: newGame.board,
                currentPlayer: newGame.currentPlayer,
                timers: newGame.timers,
                yourELO: elo1,
                opponentELO: elo2,
                opponentPseudo: pseudo2,
                message: 'Nouvelle partie commencée!'
            });

            player2Socket.emit('privateRematchStart', {
                gameId: newGame.gameId,
                color: 'black',
                board: newGame.board,
                currentPlayer: newGame.currentPlayer,
                timers: newGame.timers,
                yourELO: elo2,
                opponentELO: elo1,
                opponentPseudo: pseudo1,
                message: 'Nouvelle partie commencée!'
            });

            sendGameStartInfoMessage(player1SocketId, newGame.gameId, pseudo2, elo1, elo2);
            sendGameStartInfoMessage(player2SocketId, newGame.gameId, pseudo1, elo2, elo1);

            console.log(`[rematchPrivateRoom] Événements envoyés aux deux joueurs`);

        } catch (error) {
            console.error('[rematchPrivateRoom] Erreur:', error);
            socket.emit('privateRoomError', {
                message: 'Erreur lors du rematch'
            });
        }
    });
});

// ===========================
// DÉMARRAGE DU SERVEUR
// ===========================

server.listen(PORT, () => {
    console.log(`\n🎮 Serveur d'échecs multiplayer démarré sur http://localhost:${PORT}`);
    console.log(`Socket.io est actif et prêt à recevoir des connexions...\n`);
});
