const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
context.scale(24, 24);

const nextContexts = ['next-1', 'next-2', 'next-3'].map(id => {
    const canvas = document.getElementById(id);
    const ctx = canvas.getContext('2d');
    ctx.scale(24, 24);
    return ctx;
});

const holdCanvas = document.getElementById('hold');
const holdContext = holdCanvas.getContext('2d');
holdContext.scale(24, 24);

const startMenu = document.getElementById('start-menu');
const gameOverScreen = document.getElementById('game-over-screen');
const pauseScreen = document.getElementById('pause-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const difficultyBtns = document.querySelectorAll('.difficulty-btn');
const finalScoreEl = document.getElementById('final-score');
const highscoreList = document.getElementById('highscore-list');
const comboDisplay = document.getElementById('combo-display');

const sounds = {
    move: new Audio('move.wav'), rotate: new Audio('rotate.wav'),
    lock: new Audio('lock.wav'), clear: new Audio('clear.wav'),
    gameover: new Audio('gameover.wav')
};

const ARENA_WIDTH = 10, ARENA_HEIGHT = 20;
const arena = createMatrix(ARENA_WIDTH, ARENA_HEIGHT);

const player = {
    pos: {x: 0, y: 0}, matrix: null, hold: null,
    canHold: true, score: 0, level: 1, lines: 0, combo: 0
};

let nextPieces = [];

const colors = [null, '#ff00ff', '#00f2ff', '#ff8e0d', '#3877ff', '#0dff72', '#f538ff', '#ffe138'];
const speedLevels = { 1: 1000, 2: 900, 3: 800, 4: 700, 5: 600, 6: 500, 7: 400, 8: 300, 9: 200, 10: 150 };

let dropCounter = 0, dropInterval = speedLevels[1];
let lastTime = 0, animationFrameId, gameState = 'menu', selectedDifficulty = 1;
let highScores = JSON.parse(localStorage.getItem('highScores')) || [];
let particles = [];

function playSound(sound) { sound.currentTime = 0; sound.play().catch(e => {}); }

function update(time = 0) {
    if (gameState === 'paused') {
        animationFrameId = requestAnimationFrame(update);
        return;
    }
    if (gameState !== 'playing') {
        draw();
        animationFrameId = requestAnimationFrame(update);
        return;
    }
    const deltaTime = time - lastTime;
    lastTime = time;
    dropCounter += deltaTime;
    if (dropCounter > dropInterval) playerDrop();
    draw();
    animationFrameId = requestAnimationFrame(update);
}

document.addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'p') { togglePause(); return; }
    if (gameState !== 'playing') return;
    if (event.key === 'ArrowLeft') { playerMove(-1); playSound(sounds.move); }
    else if (event.key === 'ArrowRight') { playerMove(1); playSound(sounds.move); }
    else if (event.key === 'ArrowDown') { playerDrop(); playSound(sounds.move); }
    else if (event.key === 'ArrowUp') { playerRotate(1); playSound(sounds.rotate); }
    else if (event.key.toLowerCase() === 'c') holdPiece();
});

async function arenaSweep() {
    let linesToClear = [];
    outer: for (let y = arena.length - 1; y > 0; --y) {
        for (let x = 0; x < arena[y].length; ++x) {
            if (arena[y][x] === 0) continue outer;
        }
        linesToClear.push(y);
    }

    if (linesToClear.length > 0) {
        player.combo++;
        showCombo(player.combo);
        playSound(sounds.clear);
        for (const y of linesToClear) {
            for (let x = 0; x < ARENA_WIDTH; x++) createParticles(x, y, colors[arena[y][x]]);
        }
        gameState = 'clearing';
        await new Promise(resolve => setTimeout(resolve, 300));
        gameState = 'playing';

        for (const y of linesToClear) {
            const row = arena.splice(y, 1)[0].fill(0);
            arena.unshift(row);
        }

        player.score += (linesToClear.length * 10 + (player.combo - 1) * 10) * player.level;
        player.lines += linesToClear.length;
        const newLevel = Math.floor(player.lines / 10) + selectedDifficulty;
        if (newLevel > player.level) {
            player.level = newLevel;
            dropInterval = speedLevels[Math.min(player.level, 10)] || 100;
        }
    } else {
        player.combo = 0; // Reset combo if no lines cleared
    }
}

function collide(arena, player) {
    const [m, o] = [player.matrix, player.pos];
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 && (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) return true;
        }
    }
    return false;
}

function createMatrix(w, h) { return Array.from({length: h}, () => new Array(w).fill(0)); }

function createPiece(type) {
    if (type === 'T') return [[0,1,0],[1,1,1],[0,0,0]];
    if (type === 'O') return [[2,2],[2,2]];
    if (type === 'L') return [[0,3,0],[0,3,0],[0,3,3]];
    if (type === 'J') return [[0,4,0],[0,4,0],[4,4,0]];
    if (type === 'I') return [[0,5,0,0],[0,5,0,0],[0,5,0,0],[0,5,0,0]];
    if (type === 'S') return [[0,6,6],[6,6,0],[0,0,0]];
    if (type === 'Z') return [[7,7,0],[0,7,7],[0,0,0]];
}

function draw() {
    context.fillStyle = 'rgba(13, 13, 33, 1)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawMatrix(arena, {x: 0, y: 0}, context);
    if (gameState === 'playing') {
        drawGhost();
        drawMatrix(player.matrix, player.pos, context, false, true);
    }
    drawParticles();
    drawNext();
    drawHold();
    updateUI();
}

function drawMatrix(matrix, offset, ctx, ghost = false, glow = false) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                const color = colors[value];
                if (glow) { ctx.shadowBlur = 20; ctx.shadowColor = color; }
                ctx.fillStyle = ghost ? 'rgba(255, 255, 255, 0.1)' : color;
                ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
                ctx.shadowBlur = 0;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.fillRect(x + offset.x + 0.1, y + offset.y + 0.1, 0.8, 0.8);
            }
        });
    });
}

function drawNext() {
    nextContexts.forEach((ctx, i) => {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (nextPieces[i]) {
            const piece = nextPieces[i];
            const x_offset = (4 - piece[0].length) / 2;
            const y_offset = (4 - piece.length) / 2;
            drawMatrix(piece, {x: x_offset, y: y_offset}, ctx);
        }
    });
}

function drawHold() {
    holdContext.fillStyle = 'rgba(0,0,0,0.5)';
    holdContext.fillRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (player.hold) {
        const x_offset = (5 - player.hold[0].length) / 2;
        const y_offset = (5 - player.hold.length) / 2;
        drawMatrix(player.hold, {x: x_offset, y: y_offset}, holdContext);
    }
}

function drawGhost() {
    const ghostPos = { ...player.pos };
    while (!collide(arena, { matrix: player.matrix, pos: ghostPos })) ghostPos.y++;
    ghostPos.y--;
    drawMatrix(player.matrix, ghostPos, context, true);
}

function merge(arena, player) {
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) arena[y + player.pos.y][x + player.pos.x] = value;
        });
    });
}

async function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) {
        player.pos.y--;
        merge(arena, player);
        playSound(sounds.lock);
        await arenaSweep();
        playerReset();
        player.canHold = true;
    }
    dropCounter = 0;
}

function playerMove(dir) {
    player.pos.x += dir;
    if (collide(arena, player)) player.pos.x -= dir;
}

function playerReset() {
    player.matrix = nextPieces.shift();
    fillNextPieces();
    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
    if (collide(arena, player)) {
        playSound(sounds.gameover);
        gameState = 'gameover';
        cancelAnimationFrame(animationFrameId);
        updateHighScores(player.score);
        finalScoreEl.innerText = player.score;
        gameOverScreen.classList.remove('hidden');
    }
}

function playerRotate(dir) {
    const pos = player.pos.x;
    let offset = 1;
    rotate(player.matrix, dir);
    while (collide(arena, player)) {
        player.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > player.matrix[0].length) { rotate(player.matrix, -dir); player.pos.x = pos; return; }
    }
}

function rotate(matrix, dir) {
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
    }
    if (dir > 0) matrix.forEach(row => row.reverse());
    else matrix.reverse();
}

function holdPiece() {
    if (!player.canHold) return;
    if (player.hold) {
        [player.matrix, player.hold] = [player.hold, player.matrix];
    } else {
        player.hold = player.matrix;
        playerReset();
    }
    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
    player.canHold = false;
}

function updateUI() {
    document.getElementById('score').innerText = player.score;
    document.getElementById('level').innerText = player.level;
}

function startGame() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    arena.forEach(row => row.fill(0));
    player.score = 0; player.lines = 0; player.level = selectedDifficulty; player.combo = 0;
    player.hold = null; player.canHold = true;
    fillNextPieces();
    playerReset();
    dropInterval = speedLevels[player.level];
    gameState = 'playing';
    startMenu.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    lastTime = 0; // Reset the timer
    update(); // Unconditionally start the new game loop
}

function fillNextPieces() {
    const pieces = 'ILJOTSZ';
    while (nextPieces.length < 4) {
        nextPieces.push(createPiece(pieces[pieces.length * Math.random() | 0]));
    }
}

function updateHighScores(score) {
    highScores.push(score);
    highScores.sort((a, b) => b - a);
    highScores = highScores.slice(0, 5);
    localStorage.setItem('highScores', JSON.stringify(highScores));
    displayHighScores();
}

function displayHighScores() { highscoreList.innerHTML = highScores.map(score => `<li>${score}</li>`).join(''); }

function createParticles(x, y, color) {
    for (let i = 0; i < 15; i++) {
        particles.push({ x: x + 0.5, y: y + 0.5, vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5, color: color, alpha: 1 });
    }
}

function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.alpha -= 0.02;
        if (p.alpha <= 0) particles.splice(i, 1);
        else { context.globalAlpha = p.alpha; context.fillStyle = p.color; context.fillRect(p.x, p.y, 0.1, 0.1); context.globalAlpha = 1; }
    }
}

function showCombo(combo) {
    if (combo < 2) return;
    comboDisplay.textContent = `COMBO x${combo}`;
    comboDisplay.style.opacity = 1;
    setTimeout(() => { comboDisplay.style.opacity = 0; }, 1000);
}

function togglePause() {
    if (gameState === 'playing') {
        gameState = 'paused';
        pauseScreen.classList.remove('hidden');
    } else if (gameState === 'paused') {
        gameState = 'playing';
        pauseScreen.classList.add('hidden');
    }
}

difficultyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        difficultyBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedDifficulty = parseInt(btn.dataset.level);
    });
});

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

difficultyBtns[0].classList.add('selected');
displayHighScores();
update(); 