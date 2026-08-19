const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const mainMenu = document.getElementById("mainMenu");
const gameHUD = document.getElementById("gameHUD");
const modeSelect = document.getElementById("modeSelect");

// --- GAME SETTINGS ---
const blockSize = 40;
let columns, rows;
let worldMap = [];
let isGameRunning = false;
let gameMode = "creative"; 

const players = [];
const zombies = [];

// Colors & Emojis
const COLOR_GRASS = "#228B22";
const COLOR_DIRT = "#8B4513";
const EMOJI_P1 = "🤠";
const EMOJI_P2 = "👽";
const EMOJI_ZOMBIE = "🧟";
const EMOJI_HEART = "❤️";

// Day/Night Cycle
let timeOfDay = 0; 
const dayDuration = 3600; 
let currentLightness = 70; 

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    columns = Math.ceil(canvas.width / blockSize);
    rows = Math.ceil(canvas.height / blockSize);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function generateWorld() {
    worldMap = [];
    let groundLevel = Math.floor(rows / 2); 
    for (let y = 0; y < rows; y++) {
        let row = [];
        for (let x = 0; x < columns; x++) {
            if (y < groundLevel) row.push(0); 
            else if (y === groundLevel) row.push(1); 
            else row.push(2); 
        }
        worldMap.push(row);
    }
}

function loadOrGenerateWorld() {
    let saved = localStorage.getItem("maanitWorld");
    if (saved) worldMap = JSON.parse(saved);
    else generateWorld();
}

window.saveGame = function() {
    localStorage.setItem("maanitWorld", JSON.stringify(worldMap));
    alert("💾 Game Saved!");
};

window.restartGame = function() {
    if (confirm("Are you SURE you want to restart? Your buildings will be destroyed!")) {
        localStorage.removeItem("maanitWorld");
        generateWorld();
        zombies.length = 0; 
    }
};

function createPlayers(count) {
    players.length = 0; 
    for(let i=0; i<count; i++) {
        players.push({
            id: i,
            x: (columns * blockSize) / 2 + (i === 0 ? -100 : 100), 
            y: 100,
            width: 40, height: 40, 
            vx: 0, vy: 0, 
            emoji: i === 0 ? EMOJI_P1 : EMOJI_P2, 
            color: i === 0 ? "red" : "blue",
            speed: 6,
            jumpPower: 14,
            grounded: false,
            targetX: 0, targetY: 0,
            mineCooldown: 0,
            health: 3,
            inventory: 0,
            invulnerable: 0
        });
    }
}

function spawnZombie() {
    if (currentLightness < 30 && zombies.length < 5 && Math.random() < 0.01) {
        let startX = Math.random() * (canvas.width - 40);
        zombies.push({
            x: startX,
            y: 0, 
            width: 40, height: 40,
            vx: (Math.random() > 0.5 ? 2 : -2), 
            vy: 0,
            grounded: false
        });
    }
}

window.startGame = function(count) {
    gameMode = modeSelect.value; 
    mainMenu.style.display = "none"; 
    gameHUD.style.display = "block"; 
    
    loadOrGenerateWorld();
    createPlayers(count);
    zombies.length = 0; 
    
    isGameRunning = true;
    gameLoop(); 
};

function handleControllers() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    
    for (let i = 0; i < players.length; i++) {
        let p = players[i];
        let pad = gamepads[i]; 
        
        if (pad) {
            let stickX = pad.axes[0]; 
            if (stickX < -0.2) p.vx = -p.speed; 
            else if (stickX > 0.2) p.vx = p.speed; 
            else p.vx = 0; 

            let aimX = pad.axes[2];
            let aimY = pad.axes[3];
            let reach = blockSize * 1.5; 
            
            let chestX = p.x + (p.width/2);
            let chestY = p.y + (p.height/2);

            if (Math.abs(aimX) > 0.2 || Math.abs(aimY) > 0.2) {
                chestX += aimX * reach;
                chestY += aimY * reach;
            } else {
                let direction = (p.vx < 0) ? -1 : 1; 
                chestX += direction * reach;
            }

            p.targetX = Math.floor(chestX / blockSize);
            p.targetY = Math.floor(chestY / blockSize);

            if (pad.buttons[0].pressed && p.grounded) {
                p.vy = -p.jumpPower;
            }

            if (p.mineCooldown > 0) p.mineCooldown--;
            if (p.invulnerable > 0) p.invulnerable--;

            if ((pad.buttons[2].pressed || pad.buttons[7].pressed) && p.mineCooldown === 0) {
                if (p.targetY >= 0 && p.targetY < rows && p.targetX >= 0 && p.targetX < columns) {
                    if (worldMap[p.targetY] && worldMap[p.targetY][p.targetX] !== 0) {
                        worldMap[p.targetY][p.targetX] = 0; 
                        p.mineCooldown = 15; 
                        if (gameMode === "survival") p.inventory++;
                    }
                }
            }

            if (pad.buttons[1].pressed && p.mineCooldown === 0) {
                if (p.targetY >= 0 && p.targetY < rows && p.targetX >= 0 && p.targetX < columns) {
                    if (worldMap[p.targetY] && worldMap[p.targetY][p.targetX] === 0) {
                        if (gameMode === "creative" || p.inventory > 0) {
                            worldMap[p.targetY][p.targetX] = 2; 
                            p.mineCooldown = 15;
                            if (gameMode === "survival") p.inventory--;
                        }
                    }
                }
            }
        } else {
            p.vx = 0; 
            if (p.invulnerable > 0) p.invulnerable--;
        }
    }
}

function applyPhysics(entity) {
    entity.vy += 0.8; 
    if (entity.vy > 15) entity.vy = 15; 
    
    entity.x += entity.vx;
    entity.y += entity.vy;

    if (entity.x < 0) { entity.x = 0; entity.vx *= -1; }
    if (entity.x + entity.width > canvas.width) { entity.x = canvas.width - entity.width; entity.vx *= -1; }

    entity.grounded = false;
    let leftCol = Math.floor(entity.x / blockSize);
    let rightCol = Math.floor((entity.x + entity.width - 1) / blockSize); 
    let bottomRow = Math.floor((entity.y + entity.height) / blockSize);

    if (bottomRow >= 0 && bottomRow < rows) {
        if (worldMap[bottomRow] && (worldMap[bottomRow][leftCol] !== 0 || worldMap[bottomRow][rightCol] !== 0)) {
            entity.y = (bottomRow * blockSize) - entity.height; 
            entity.vy = 0;
            entity.grounded = true;
        }
    }

    let centerRow = Math.floor((entity.y + entity.height/2) / blockSize);
    if (centerRow >= 0 && centerRow < rows && worldMap[centerRow]) {
        if (entity.vx > 0 && rightCol + 1 < columns && worldMap[centerRow][rightCol + 1] !== 0) {
            entity.vx *= -1; 
        } else if (entity.vx < 0 && leftCol - 1 >= 0 && worldMap[centerRow][leftCol - 1] !== 0) {
            entity.vx *= -1; 
        }
    }
}

function updatePhysics() {
    for (let p of players) {
        applyPhysics(p);

        if (gameMode === "survival" && p.invulnerable <= 0) {
            for (let z of zombies) {
                if (p.x < z.x + z.width && p.x + p.width > z.x &&
                    p.y < z.y + z.height && p.y + p.height > z.y) {
                    
                    p.health--;
                    p.invulnerable = 60; 
                    p.vy = -10; 
                    p.vx = (p.x < z.x) ? -10 : 10; 
                    
                    if (p.health <= 0) {
                        p.health = 3;
                        p.x = canvas.width / 2;
                        p.y = 0; 
                        p.inventory = 0; 
                    }
                }
            }
        }
    }

    for (let i = zombies.length - 1; i >= 0; i--) {
        let z = zombies[i];
        applyPhysics(z);
        if (currentLightness >= 45) {
            zombies.splice(i, 1);
        }
    }
}

function draw() {
    let timePercent = timeOfDay / dayDuration;
    let lightLevel = Math.sin(timePercent * Math.PI * 2); 
    currentLightness = 40 + (lightLevel * 30); 
    
    ctx.fillStyle = `hsl(197, 71%, ${currentLightness}%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (currentLightness < 25) {
        ctx.fillStyle = "white";
        for(let i=0; i<30; i++) {
            let starX = (i * 97) % canvas.width;
            let starY = (i * 31) % (canvas.height / 2);
            ctx.fillRect(starX, starY, 3, 3);
        }
    }

    for (let y = 0; y < rows; y++) {
        if (!worldMap[y]) continue; 
        for (let x = 0; x < columns; x++) {
            let b = worldMap[y][x];
            if (b === 1) { 
                ctx.fillStyle = COLOR_GRASS;
                ctx.fillRect(x * blockSize, y * blockSize, blockSize, blockSize);
                ctx.strokeStyle = "black";
                ctx.strokeRect(x * blockSize, y * blockSize, blockSize, blockSize);
            } else if (b === 2) { 
                ctx.fillStyle = COLOR_DIRT;
                ctx.fillRect(x * blockSize, y * blockSize, blockSize, blockSize);
                ctx.strokeStyle = "black";
                ctx.strokeRect(x * blockSize, y * blockSize, blockSize, blockSize);
            }
        }
    }

    ctx.font = "40px Arial";
    ctx.textBaseline = "top"; 
    
    for (let z of zombies) {
        ctx.fillText(EMOJI_ZOMBIE, z.x, z.y);
    }

    for (let p of players) {
        if (p.invulnerable > 0 && Math.floor(Date.now() / 100) % 2 === 0) {
            // blink
        } else {
            ctx.fillText(p.emoji, p.x, p.y);
        }

        if (gameMode === "survival") {
            ctx.font = "20px Arial";
            let hearts = EMOJI_HEART.repeat(p.health);
            ctx.fillText(hearts, p.x - 10, p.y - 30);
            ctx.fillStyle = "white";
            ctx.fillText("🟫 x" + p.inventory, p.x - 10, p.y - 55);
            ctx.font = "40px Arial"; 
        }

        if (p.targetY >= 0 && p.targetY < rows && p.targetX >= 0 && p.targetX < columns) {
            ctx.strokeStyle = p.color; 
            ctx.lineWidth = 3;
            ctx.strokeRect(p.targetX * blockSize, p.targetY * blockSize, blockSize, blockSize);
            ctx.lineWidth = 1; 
        }
    }
}

function gameLoop() {
    if (!isGameRunning) return;
    timeOfDay = (timeOfDay + 1) % dayDuration;
    if (gameMode === "survival") spawnZombie();
    handleControllers(); 
    updatePhysics();     
    draw();              
    requestAnimationFrame(gameLoop);
}
