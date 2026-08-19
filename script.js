const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const mainMenu = document.getElementById("mainMenu");
const gameHUD = document.getElementById("gameHUD");
const modeSelect = document.getElementById("modeSelect");

// --- GAME SETTINGS ---
const blockSize = 40;
let columns;
const rows = 100; // HUGE UPGRADE: World is now 100 blocks tall (Lots of sky!)
let worldMap = [];
let isGameRunning = false;
let gameMode = "creative"; 
let cameraY = 0; // The camera to follow players up into the sky

const players = [];
const zombies = [];

// Colors & Emojis
const COLOR_GRASS = "#228B22";
const COLOR_DIRT = "#8B4513";
const EMOJI_ZOMBIE = "🧟";
const EMOJI_HEART = "❤️";

// --- REMOVE WHITE BACKGROUND FROM IMAGES ---
let finalCatnapImg = new Image();
let finalJumboImg = new Image();

function removeWhiteBackground(src, callback) {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = function() {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tCtx = tempCanvas.getContext("2d");
        tCtx.drawImage(img, 0, 0);
        const imgData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            // If the pixel is white (or very light gray), make it completely invisible!
            if (data[i] > 230 && data[i+1] > 230 && data[i+2] > 230) {
                data[i+3] = 0; // 0 means transparent
            }
        }
        tCtx.putImageData(imgData, 0, 0);
        const newImg = new Image();
        newImg.src = tempCanvas.toDataURL();
        callback(newImg);
    };
    img.src = src;
}

// Clean up the images as soon as the game loads
removeWhiteBackground("catnap.jpg", (img) => { finalCatnapImg = img; });
removeWhiteBackground("jumbo_josh.png", (img) => { finalJumboImg = img; });

// Day/Night Cycle
let timeOfDay = 0; 
const dayDuration = 3600; 
let currentLightness = 70; 

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    columns = Math.ceil(canvas.width / blockSize);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function generateWorld() {
    worldMap = [];
    let groundLevel = 75; // Ground is way down at block 75, giving 75 blocks of sky to build up!
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
    if (saved) {
        worldMap = JSON.parse(saved);
        // Ensure the loaded world fits if they resized the window
        for (let y = 0; y < worldMap.length; y++) {
            while (worldMap[y].length < columns) {
                worldMap[y].push(worldMap[y][worldMap[y].length-1]); 
            }
        }
    }
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
            y: 70 * blockSize, // Drop them near the ground
            width: 40, height: 40, 
            vx: 0, vy: 0, 
            img: i === 0 ? finalCatnapImg : finalJumboImg, 
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
            y: 70 * blockSize, 
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
                        p.y = 70 * blockSize; 
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

// THE CAMERA BRAIN
function updateCamera() {
    if (players.length === 0) return;
    
    // Find the player who has climbed the highest!
    let highestY = players[0].y;
    if (players.length > 1 && players[1].y < highestY) {
        highestY = players[1].y;
    }

    let targetCamY = highestY - (canvas.height / 2);
    
    // Smooth camera movement
    cameraY += (targetCamY - cameraY) * 0.1;
    
    // Don't let the camera look below the dirt or above the very top of the sky
    let maxCamY = (rows * blockSize) - canvas.height;
    if (cameraY < 0) cameraY = 0;
    if (cameraY > maxCamY) cameraY = maxCamY;
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
            let starY = ((i * 31) % (canvas.height / 2)); 
            ctx.fillRect(starX, starY, 3, 3);
        }
    }

    // Draw Blocks (Now with Camera Offset!)
    for (let y = 0; y < rows; y++) {
        let drawY = (y * blockSize) - cameraY;
        // Optimization: don't draw blocks that are off the screen
        if (drawY < -blockSize || drawY > canvas.height) continue;
        
        if (!worldMap[y]) continue; 
        for (let x = 0; x < columns; x++) {
            let b = worldMap[y][x];
            if (b === 1) { 
                ctx.fillStyle = COLOR_GRASS;
                ctx.fillRect(x * blockSize, drawY, blockSize, blockSize);
                ctx.strokeStyle = "black";
                ctx.strokeRect(x * blockSize, drawY, blockSize, blockSize);
            } else if (b === 2) { 
                ctx.fillStyle = COLOR_DIRT;
                ctx.fillRect(x * blockSize, drawY, blockSize, blockSize);
                ctx.strokeStyle = "black";
                ctx.strokeRect(x * blockSize, drawY, blockSize, blockSize);
            }
        }
    }

    ctx.font = "40px Arial";
    ctx.textBaseline = "top"; 
    
    // Draw Zombies
    for (let z of zombies) {
        ctx.fillText(EMOJI_ZOMBIE, z.x, z.y - cameraY);
    }

    // Draw Players
    for (let p of players) {
        if (p.invulnerable > 0 && Math.floor(Date.now() / 100) % 2 === 0) {
            // blink
        } else {
            if (p.img && p.img.complete && p.img.naturalWidth !== 0) {
                ctx.drawImage(p.img, p.x, p.y - cameraY, p.width, p.height);
            }
        }

        if (p.targetY >= 0 && p.targetY < rows && p.targetX >= 0 && p.targetX < columns) {
            ctx.strokeStyle = p.color; 
            ctx.lineWidth = 3;
            ctx.strokeRect(p.targetX * blockSize, (p.targetY * blockSize) - cameraY, blockSize, blockSize);
            ctx.lineWidth = 1; 
        }
    }

    // Draw HUD (Fixed to screen)
    if (gameMode === "survival") {
        for (let i = 0; i < players.length; i++) {
            let p = players[i];
            
            // P1 on left, P2 on right
            let uiX = (i === 0) ? 20 : canvas.width - 200;
            let uiY = 60; // Below Save/Restart buttons
            
            ctx.font = "24px Arial";
            ctx.fillStyle = "white";
            
            // Name
            ctx.fillStyle = p.color;
            ctx.fillText(`Player ${i+1}`, uiX, uiY - 30);
            
            // Hearts
            let hearts = EMOJI_HEART.repeat(p.health);
            ctx.fillText(hearts, uiX, uiY);
            
            // Inventory
            ctx.fillStyle = "white";
            ctx.fillText("🟫 x" + p.inventory, uiX, uiY + 30);
        }
    }
}

function gameLoop() {
    if (!isGameRunning) return;
    timeOfDay = (timeOfDay + 1) % dayDuration;
    if (gameMode === "survival") spawnZombie();
    
    handleControllers(); 
    updatePhysics();     
    updateCamera(); // New Camera Logic
    draw();              
    
    requestAnimationFrame(gameLoop);
}
