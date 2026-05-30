const socket = io();

// =====================
// 画面要素
// =====================
const createRoomBtn = document.getElementById("createRoom");
const joinRoomBtn = document.getElementById("joinRoom");
const roomInput = document.getElementById("roomInput");
const roomInfo = document.getElementById("roomInfo");
const waitRoomId = document.getElementById("waitRoomId");

// 入力画面
const inputs = document.querySelectorAll(".card");
const checkButton = document.getElementById("checkButton");
const keyboard = document.getElementById("keyboard");
const specialKeyboard = document.getElementById("specialKeyboard");

// バトル画面
const result = document.getElementById("result");
const keyboard2 = document.getElementById("keyboard2");

// =====================
// 状態
// =====================
let currentIndex = 0;
let answer = [];
let usedKana = [];
let myTurn = false;
let wins = 0;
let losses = 0;
let myRoomId = null;
let isHost = false;
let turnOrder = [];
let players = [];
let playerNames = {};
let eliminated = [];
let isSpectator = false;
let winCounts = {};
let answered = false;
let scores = {};
let timerDuration = 0;
let targetScore = 0;
let countdownInterval = null;

// =====================
// Audio管理
// =====================
const AudioManager = {
    bgm: null,
    firstHitDone: false,
    _bgmVolume: 0.15,
    _seVolume:  0.25,

    _se: {
        btnClick:  new Audio('/audio/決定ボタンを押す44.mp3'),
        keyHit:    new Audio('/audio/パッ.mp3'),
        hit:       new Audio('/audio/男衆「オウ！」.mp3'),
        win:       new Audio('/audio/男衆「イエーイ！」.mp3'),
        myTurn: new Audio('/audio/チリン.mp3'),
    },

    bgmFiles: {
        lobby:      '/audio/ロビー.mp3',
        battle:     '/audio/バトル中.mp3',
        battleHit:  '/audio/バトル中～1文字空いた～.mp3',
    },

    playBGM(name) {
        if (this.bgm) {
            this.bgm.pause();
            this.bgm.currentTime = 0;
        }
        this.bgm = new Audio(this.bgmFiles[name]);
        this.bgm.loop = true;
        this.bgm.volume = this._bgmVolume;
        this.bgm.play().catch(err => {
            console.warn(`[AudioManager] BGM "${name}" 再生失敗:`, err);
        });
    },

    stopBGM() {
        if (this.bgm) {
            this.bgm.pause();
            this.bgm.currentTime = 0;
            this.bgm = null;
        }
    },

    playSE(name) {
        const src = this._se[name];
        if (!src) return;
        const clone = src.cloneNode();
        clone.volume = this._seVolume;
        clone.play().catch(() => {});
    },

    onHit() {
        this.playSE('hit');
        if (!this.firstHitDone) {
            this.firstHitDone = true;
            this.playBGM('battleHit');
        }
    },

    reset() {
        this.firstHitDone = false;
    },
};

let _audioUnlocked = false;
AudioManager.playBGM('lobby');

document.addEventListener('click', e => {
    if (!_audioUnlocked) {
        _audioUnlocked = true;
        Object.values(AudioManager._se).forEach(a => {
            const clone = a.cloneNode();
            clone.volume = 0;
            clone.play().then(() => clone.pause()).catch(() => {});
        });
        if (!AudioManager.bgm || AudioManager.bgm.paused) {
            AudioManager.playBGM('lobby');
        }
    }
    if (e.target.tagName === 'BUTTON' && !e.target.closest('#keyboard2')) {
        AudioManager.playSE('btnClick');
    }
});

socket.on("charUpdate", (data) => {
    playerChars = data.playerChars;
});

// =====================
// 画面切り替え（screenTitleを含む）
// =====================
function showScreen(id) {
    ["screenTitle","screenRoom","screenWait","screenTheme","screenInput","screenBattle","screenWatch"].forEach(s => {
        const el = document.getElementById(s);
        el.hidden = (s !== id);
        if (s === "screenTitle") {
            el.style.display = (s === id) ? "flex" : "none";
        }
    });
    if (id === "screenWait") buildCharSelect();
}

// =====================
// 入力画面：選択ハイライト
// =====================
function updateSelection() {
    inputs.forEach(i => i.classList.remove("selected"));
    if (inputs[currentIndex]) inputs[currentIndex].classList.add("selected");
}
updateSelection();

// =====================
// 入力処理
// =====================
function inputKana(kana) {
    if (kana === "DEL") {
        if (answered) return;
        inputs[currentIndex].value = "";
        if (currentIndex > 0) currentIndex--;
        updateSelection();
        return;
    }
    if (answered) return;
    inputs[currentIndex].value = kana;
    if (currentIndex < inputs.length - 1) currentIndex++;
    updateSelection();
}

// =====================
// 攻撃処理
// =====================
function attackKana(kana, btn) {
    if (!myTurn) return;
    if (usedKana.includes(kana)) return;
    AudioManager.playSE('keyHit');
    usedKana.push(kana);
    btn.disabled = true;
    btn.style.backgroundColor = "gray";
    socket.emit("attack", { kana });
}

// =====================
// キーボード生成
// =====================
const kanaList = [
    "わ","ら","や","ま","は","な","た","さ","か","あ",
    "を","り","","み","ひ","に","ち","し","き","い",
    "ん","る","ゆ","む","ふ","ぬ","つ","す","く","う",
    "ー","れ","","め","へ","ね","て","せ","け","え",
    "","ろ","よ","も","ほ","の","と","そ","こ","お",
];

let myChar = 1;
let playerChars = {};

function buildCharSelect() {
    const grid = document.getElementById("charGrid");
    if (!grid) return;
    grid.innerHTML = "";
    for (let i = 1; i <= 8; i++) {
        const img = document.createElement("img");
        img.src = `/char${i}.png`;
        img.style.cssText = `
            width: 72px; height: 72px; object-fit: contain;
            border: 3px solid transparent; border-radius: 10px;
            cursor: pointer; background: transparent;
            transition: border 0.15s;
        `;
        img.onclick = () => {
            myChar = i;
            grid.querySelectorAll("img").forEach(el => el.style.borderColor = "transparent");
            img.style.borderColor = "#c8813a";
            socket.emit("selectChar", i);
        };
        if (i === 1) img.style.borderColor = "#c8813a";
        grid.appendChild(img);
    }
    socket.emit("selectChar", myChar);
}

function buildKeyboard(container, mode) {
    kanaList.forEach(kana => {
        if (!kana || (mode === "battle" && kana === "×")) {
            container.appendChild(document.createElement("div"));
            return;
        }
        const btn = document.createElement("button");
        btn.textContent = kana;
        if (mode === "watch") {
            btn.id = "wk-" + kana;
            btn.disabled = true;
        }
        btn.onclick = () => {
            if (mode === "input") inputKana(kana);
            if (mode === "battle") attackKana(kana, btn);
        };
        container.appendChild(btn);
    });
}

function buildSpecialKeyboard(container, mode) {
    ["DEL", "×"].forEach(kana => {
        const btn = document.createElement("button");
        btn.textContent = kana;
        btn.onclick = () => {
            if (mode === "input") inputKana(kana);
        };
        container.appendChild(btn);
    });
}

buildKeyboard(keyboard, "input");
buildSpecialKeyboard(specialKeyboard, "input");
buildKeyboard(keyboard2, "battle");
buildKeyboard(document.getElementById("watchKeyboard"), "watch");

// =====================
// カウントダウン
// =====================
const countdownDisplay = document.createElement('div');
countdownDisplay.id = 'countdownDisplay';
countdownDisplay.style.cssText = `
    font-size: 32px; font-weight: bold; text-align: center;
    margin: 2px 0 6px; min-height: 40px; letter-spacing: 0.05em;
    transition: color 0.3s;
`;
result.insertAdjacentElement('afterend', countdownDisplay);

function startCountdown(seconds) {
    if (countdownInterval) clearInterval(countdownInterval);
    let remaining = seconds;
    updateCountdownDisplay(remaining);
    countdownInterval = setInterval(() => {
        remaining--;
        updateCountdownDisplay(remaining);
        if (remaining <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }, 1000);
}

function stopCountdown() {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    updateCountdownDisplay(0);
}

function updateCountdownDisplay(seconds) {
    if (!countdownDisplay) return;
    if (seconds <= 0) { countdownDisplay.textContent = ''; return; }
    countdownDisplay.textContent = `⏱ ${seconds}`;
    countdownDisplay.style.color = seconds <= 5 ? '#c0392b' : seconds <= 10 ? '#e67e22' : '#5a2d00';
}

// =====================
// バトル画面：全プレイヤーのカード生成
// =====================
function buildAllPlayerCards(playersArr, playerNamesObj, opponentLengths, myId) {
    const area = document.getElementById("allPlayersArea");
    area.innerHTML = "";
    playersArr.forEach(id => {
        const wrapper = document.createElement("div");
        wrapper.id = "playerArea-" + id;

        const label = document.createElement("p");
        label.id = "playerLabel-" + id;

        const charId = playerChars[id] || 1;
        const charImg = document.createElement("img");
        charImg.src = `/char${charId}.png`;
        charImg.style.cssText = `
            width:32px; height:32px; object-fit:contain;
            vertical-align:middle; margin-right:6px;
        `;
        label.appendChild(charImg);
        label.appendChild(document.createTextNode(
            id === myId ? `自分：${playerNamesObj[id]}` : `${playerNamesObj[id]}`
        ));
        wrapper.appendChild(label);

        const cardsDiv = document.createElement("div");
        cardsDiv.classList.add("cards");

        const length = id === myId ? answer.length : (opponentLengths[id] || 7);
        for (let i = 0; i < length; i++) {
            const card = document.createElement("div");
            card.classList.add("card");
            card.textContent = "？";
            card.id = `card-${id}-${i}`;
            cardsDiv.appendChild(card);
        }
        wrapper.appendChild(cardsDiv);
        area.appendChild(wrapper);
    });
}

// =====================
// ターンパネル更新
// =====================
function updateTurnPanel(currentTurnId, order, names, eliminatedList) {
    const panel = document.getElementById("turnPanel");
    const currentEl = document.getElementById("turnPanelCurrent");
    const orderEl = document.getElementById("turnPanelOrder");

    const currentName = (currentTurnId && names[currentTurnId]) || "？";
    currentEl.textContent = `⚔️ ${currentName}のターン`;

    orderEl.innerHTML = "";
    (order || []).forEach(id => {
        const span = document.createElement("span");
        const wc = winCounts[id] || 0;
        const pt = scores[id] || 0;
        const ptText = targetScore > 0 ? `${pt}/${targetScore}pt` : `${pt}pt`;

        const charId = playerChars[id] || 1;
        const charImg = document.createElement("img");
        charImg.src = `/char${charId}.png`;
        charImg.style.cssText = `
            width:24px; height:24px; object-fit:contain;
            vertical-align:middle; margin-right:4px;
        `;
        span.appendChild(charImg);
        span.appendChild(document.createTextNode((names[id] || id) + ` ${wc}勝 ${ptText}`));

        span.className = "turn-order-name";
        if ((eliminatedList || []).includes(id)) {
            span.classList.add("turn-order-eliminated");
        } else if (id === currentTurnId) {
            span.classList.add("turn-order-active");
        }
        orderEl.appendChild(span);
    });

    panel.hidden = false;
}

function hideTurnPanel() {
    const currentEl = document.getElementById("turnPanelCurrent");
    if (currentEl) currentEl.textContent = "🏆 ゲーム終了";
}

function updateTurnDisplay(currentTurnId) {
    if (myTurn) {
        AudioManager.playSE('myTurn');
        result.textContent = "⚔️ あなたのターン！";
        result.style.color = "#c0392b";
        document.getElementById("keyboardArea2").classList.remove("disabled");
    } else {
        const currentName = (currentTurnId && playerNames[currentTurnId]) || "相手";
        result.textContent = `🛡️ ${currentName}のターン...`;
        result.style.color = "#888888";
        document.getElementById("keyboardArea2").classList.add("disabled");
    }
}

// =====================
// ログ追加
// =====================
function addLog(message) {
    const log = document.getElementById("battleLog");
    const line = document.createElement("p");
    line.style.margin = "2px 0";
    line.textContent = message;
    log.prepend(line);
}

// =====================
// 脱落表示
// =====================
function markEliminated(id) {
    const area = document.getElementById("playerArea-" + id);
    if (area) area.style.opacity = "0.4";
    const label = document.getElementById("playerLabel-" + id);
    if (label) label.textContent += "（脱落）";
}

// =====================
// ルーム作成
// =====================
createRoomBtn.onclick = () => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    roomInput.value = roomId;
    const playerName = document.getElementById("nameInput").value || "プレイヤー1";
    isHost = true;
    isSpectator = false;
    socket.emit("createRoom", roomId, playerName);
};

joinRoomBtn.onclick = () => {
    const playerName = document.getElementById("nameInput2").value || "プレイヤー";
    isSpectator = false;
    socket.emit("joinRoom", roomInput.value, playerName);
};

// =====================
// socket：ルーム作成完了
// =====================
socket.on("roomCreated", (roomId) => {
    myRoomId = roomId;
    AudioManager.playBGM('lobby');
    buildCharSelect();

    waitRoomId.innerHTML = "";
    const idText = document.createElement("span");
    idText.textContent = "部屋ID: " + roomId;
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "📋 コピー";
    copyBtn.style.cssText = "font-size:13px;padding:4px 10px;margin-left:8px;vertical-align:middle;";
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(roomId).then(() => {
            copyBtn.textContent = "✅ コピーしました";
            setTimeout(() => { copyBtn.textContent = "📋 コピー"; }, 2000);
        });
    };
    waitRoomId.appendChild(idText);
    waitRoomId.appendChild(copyBtn);

    const timerRow = document.createElement('div');
    timerRow.style.cssText = 'margin: 12px 0 4px; font-size: 14px; color: #5a2d00;';
    timerRow.innerHTML = `
        <label style="font-weight:bold;">⏱ 1ターンの制限時間：</label>
        <select id="timerSelect" style="padding:4px 10px;border-radius:6px;border:2px solid #c8965a;margin-left:8px;font-size:14px;background:#fffdf5;cursor:pointer;">
            <option value="0">無制限</option>
            <option value="10">10秒</option>
            <option value="15">15秒</option>
            <option value="20">20秒</option>
            <option value="30">30秒</option>
            <option value="45">45秒</option>
            <option value="60">60秒</option>
        </select>
    `;
    const startBtn = document.getElementById('startGameBtn');
    startBtn.parentNode.insertBefore(timerRow, startBtn);
    document.getElementById('timerSelect').onchange = (e) => {
        timerDuration = parseInt(e.target.value);
        socket.emit('setTimerDuration', timerDuration);
    };

    const scoreRow = document.createElement('div');
    scoreRow.style.cssText = 'margin: 8px 0 4px; font-size: 14px; color: #5a2d00;';
    scoreRow.innerHTML = `
        <label style="font-weight:bold;">🏆 勝利ポイント：</label>
        <select id="targetScoreSelect" style="padding:4px 10px;border-radius:6px;border:2px solid #c8965a;margin-left:8px;font-size:14px;background:#fffdf5;cursor:pointer;">
            <option value="0">∞（無制限）</option>
            <option value="3">3pt</option>
            <option value="5">5pt</option>
            <option value="10">10pt</option>
            <option value="15">15pt</option>
            <option value="20">20pt</option>
            <option value="30">30pt</option>
        </select>
    `;
    startBtn.parentNode.insertBefore(scoreRow, startBtn);
    document.getElementById('targetScoreSelect').onchange = (e) => {
        socket.emit('setTargetScore', parseInt(e.target.value));
    };

    showScreen("screenWait");
    document.getElementById("startGameBtn").hidden = false;
    document.getElementById("startInfo").textContent = "2人以上集まったらゲーム開始を押してください";
});

socket.on("joinedRoom", (roomId) => {
    myRoomId = roomId;
    AudioManager.playBGM('lobby');
    waitRoomId.textContent = "部屋ID: " + roomId + " に参加しました";
    showScreen("screenWait");
    document.getElementById("startGameBtn").hidden = true;
    document.getElementById("startInfo").textContent = "部屋主がゲームを開始するのを待っています...";
    buildCharSelect();
});

socket.on("roomInfo", (data) => {
    players = data.players;
    playerNames = data.playerNames;
    const list = document.getElementById("playerList");
    list.innerHTML = "<h3>参加者</h3>";
    data.players.forEach((id, i) => {
        const p = document.createElement("p");
        p.textContent = `${i + 1}. ${data.playerNames[id]}${i === 0 ? "（部屋主）" : ""}`;
        list.appendChild(p);
    });
});

document.getElementById("startGameBtn").onclick = () => {
    socket.emit("startGame");
};

socket.on("ready", (data) => {
    turnOrder = data.turnOrder;
    playerNames = data.playerNames;
    showScreen("screenTheme");
});

checkButton.onclick = () => {
    answer = Array.from(inputs).map(i => i.value || "×");
    const validCount = answer.filter(k => k !== "×").length;
    if (validCount < 2) {
        alert("2文字以上入力してください！");
        return;
    }
    socket.emit("setAnswer", answer);
    inputs.forEach(i => {
        if (i.value && i.value !== "×") i.value = "⚔️";
    });
    answered = true;
    checkButton.disabled = true;
    result.textContent = "単語を設定しました！全員の入力を待っています...";
};

socket.on("gameStart", (data) => {
    turnOrder = data.turnOrder;
    playerNames = data.playerNames;
    players = data.players;
    eliminated = [];
    scores = data.scores || {};
    timerDuration = data.timerDuration || 0;
    targetScore = data.targetScore || 0;
    stopCountdown();
    AudioManager.reset();
    AudioManager.playBGM('battle');
    document.getElementById("battleTheme").textContent = `お題：${data.theme}`;
    buildAllPlayerCards(data.players, data.playerNames, data.opponentLengths, socket.id);
    showScreen("screenBattle");
    myTurn = data.firstTurn === socket.id;
    playerChars = data.playerChars || {};

    data.players.forEach(id => {
        if (winCounts[id] === undefined) winCounts[id] = 0;
    });

    answer.forEach((kana, i) => {
        const card = document.getElementById(`card-${socket.id}-${i}`);
        if (card) {
            if (kana === "×") {
                card.textContent = "×";
                card.classList.add("opened");
                card.style.color = "#bbb";
            } else {
                card.textContent = "？";
            }
        }
    });

    const myArea = document.getElementById("playerArea-" + socket.id);
    if (myArea) {
        const old = document.getElementById("myWordDisplay");
        if (old) old.remove();
        const wordDisplay = document.createElement("div");
        wordDisplay.id = "myWordDisplay";
        const letters = answer.filter(k => k !== "×").join("　");
        wordDisplay.textContent = `🔒 ${letters}`;
        wordDisplay.style.cssText = `
            font-size: 13px; color: #7a4800; margin-top: 6px;
            background: rgba(255,240,200,0.7); border-radius: 6px;
            padding: 3px 10px; letter-spacing: 0.1em; text-align: center;
        `;
        myArea.appendChild(wordDisplay);
    }

    updateTurnDisplay(data.firstTurn);
    updateTurnPanel(data.firstTurn, data.turnOrder, data.playerNames, []);
    addLog(`ターン順: ${data.turnOrder.map(id => data.playerNames[id]).join(" → ")}`);
});

socket.on("timerStart", (data) => {
    startCountdown(data.duration);
});

socket.on("turnTimeout", (data) => {
    stopCountdown();
    myTurn = data.nextTurn === socket.id;
    if (myTurn) AudioManager.playSE('myTurn');

    if (myTurn) {
        result.textContent = "⏰ 時間切れ！あなたのターン！";
        result.style.color = "#c0392b";
        document.getElementById("keyboardArea2").classList.remove("disabled");
    } else {
        const nextName = playerNames[data.nextTurn] || "？";
        result.textContent = `⏰ 時間切れ！${nextName}のターン`;
        result.style.color = "#888";
        document.getElementById("keyboardArea2").classList.add("disabled");
    }

    addLog(`⏰ 時間切れ → ${playerNames[data.nextTurn]}のターン`);
    updateTurnPanel(data.nextTurn, turnOrder, playerNames, eliminated);
});

socket.on("attackResult", (data) => {
    stopCountdown();
    Object.entries(data.hitResults).forEach(([id, indexes]) => {
        indexes.forEach(i => {
            const card = document.getElementById(`card-${id}-${i}`);
            if (card) { card.textContent = data.kana; card.classList.add("opened"); }
        });
    });

    if (data.hitSelf && data.hitAny) {
        AudioManager.onHit();
        addLog(`⚔️ 自分→「${data.kana}」ヒット＋自爆 ターン交代`);
        result.textContent = "ヒット！でも自爆... ターン交代";
        result.style.color = "#888";
    } else if (data.hitSelf) {
        addLog(`💥 自分→「${data.kana}」自爆 ターン交代`);
        result.textContent = "自爆！ターン交代";
        result.style.color = "#888";
    } else if (data.hitAny) {
        AudioManager.onHit();
        addLog(`⚔️ 自分→「${data.kana}」ヒット！`);
        result.textContent = "ヒット！続けて攻撃！";
        result.style.color = "#c0392b";
    } else {
        addLog(`❌ 自分→「${data.kana}」ミス ターン交代`);
        result.textContent = "ミス... ターン交代";
        result.style.color = "#888";
    }

    data.newlyEliminated.forEach(id => {
        eliminated.push(id);
        markEliminated(id);
        addLog(`💀 ${playerNames[id]} 脱落！`);
    });

    myTurn = !data.turnChanged;
    if (myTurn) AudioManager.playSE('myTurn');
    if (data.turnChanged) {
        document.getElementById("keyboardArea2").classList.add("disabled");
        addLog(`→ ${playerNames[data.nextTurn]}のターン`);
        updateTurnPanel(data.nextTurn, turnOrder, playerNames, eliminated);
    } else {
        document.getElementById("keyboardArea2").classList.remove("disabled");
        updateTurnPanel(socket.id, turnOrder, playerNames, eliminated);
    }
});

socket.on("attacked", (data) => {
    stopCountdown();
    Object.entries(data.hitResults).forEach(([id, indexes]) => {
        indexes.forEach(i => {
            const card = document.getElementById(`card-${id}-${i}`);
            if (card) { card.textContent = data.kana; card.classList.add("opened"); }
        });
    });

    keyboard2.querySelectorAll("button").forEach(btn => {
        if (btn.textContent === data.kana) {
            btn.disabled = true;
            btn.style.backgroundColor = "gray";
        }
    });

    const attackerName = playerNames[data.attacker] || "?";
    if (data.hitSelf && data.hitAny) {
        AudioManager.onHit();
        addLog(`⚔️ ${attackerName}→「${data.kana}」ヒット＋自爆`);
    } else if (data.hitSelf) {
        addLog(`💥 ${attackerName}→「${data.kana}」自爆`);
    } else if (data.hitAny) {
        AudioManager.onHit();
        addLog(`⚔️ ${attackerName}→「${data.kana}」ヒット！`);
    } else {
        addLog(`❌ ${attackerName}→「${data.kana}」ミス`);
    }

    data.newlyEliminated.forEach(id => {
        eliminated.push(id);
        markEliminated(id);
        addLog(`💀 ${playerNames[id]} 脱落！`);
    });

    myTurn = data.nextTurn === socket.id;
    if (myTurn) AudioManager.playSE('myTurn');
    addLog(`→ ${playerNames[data.nextTurn]}のターン`);
    updateTurnDisplay(data.nextTurn);
    updateTurnPanel(data.nextTurn, turnOrder, playerNames, eliminated);
});

socket.on("gameEnd", (data) => {
    AudioManager.stopBGM();
    AudioManager.playSE('win');
    stopCountdown();

    scores = data.scores || scores;
    winCounts[data.winner] = (winCounts[data.winner] || 0) + 1;

    if (data.winner === socket.id) {
        wins++;
        const ptText = data.winnerScore != null ? ` +${data.winnerScore}pt` : '';
        result.textContent = `🎉 あなたの勝ち！${ptText}`;
        addLog(`🎉 ゲーム終了 - あなたの勝ち！${ptText}`);
    } else {
        losses++;
        const ptText = data.winnerScore != null ? ` +${data.winnerScore}pt` : '';
        result.textContent = `💀 ${data.winnerName} の勝ち！`;
        addLog(`🏆 ゲーム終了 - ${data.winnerName} の勝利！${ptText}`);
    }
    myTurn = false;

    updateTurnPanel(null, turnOrder, playerNames, eliminated);
    hideTurnPanel();
    document.getElementById("rematchBtn").hidden = false;
});

socket.on("matchEnd", (data) => {
    scores = {};
    const isWinner = data.winner === socket.id;

    const banner = document.createElement("div");
    banner.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        background: rgba(0,0,0,0.85);
        animation: fadeInBanner 0.5s ease;
    `;

    if (!document.getElementById('bannerStyle')) {
        const style = document.createElement('style');
        style.id = 'bannerStyle';
        style.textContent = `
            @keyframes fadeInBanner {
                from { opacity: 0; transform: scale(0.92); }
                to   { opacity: 1; transform: scale(1); }
            }
            @keyframes popIn {
                from { opacity: 0; transform: scale(0.7); }
                to   { opacity: 1; transform: scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

    const img = document.createElement("img");
    img.src = isWinner ? '/win.png' : '/lose.png';
    img.style.cssText = `
        max-width: 88vw; max-height: 70vh; object-fit: contain;
        border-radius: 12px; box-shadow: 0 8px 40px rgba(0,0,0,0.6);
        animation: popIn 0.4s ease 0.1s both;
    `;

    const subText = document.createElement("div");
    subText.style.cssText = `
        color: #fff; font-size: 16px; margin: 16px 0 0;
        text-shadow: 0 1px 4px rgba(0,0,0,0.8);
        animation: popIn 0.4s ease 0.25s both;
    `;
    subText.textContent = isWinner
        ? `目標 ${data.targetScore || ''}pt 達成！完全勝利！`
        : `${data.winnerName} が完全勝利しました`;

    const btn = document.createElement("button");
    btn.textContent = "続ける";
    btn.style.cssText = `margin-top: 20px; font-size: 17px; padding: 10px 40px; animation: popIn 0.4s ease 0.4s both;`;
    btn.onclick = () => banner.remove();

    banner.appendChild(img);
    banner.appendChild(subText);
    banner.appendChild(btn);
    document.body.appendChild(banner);

    addLog(`🏆 マッチ終了 - ${data.winnerName} の完全勝利！`);
});

// =====================
// お題リスト
// =====================
const themeList = [
    "ファストフード店のメニュー","コンビニ商品","アイスの名前","カップ麺","お菓子",
    "飲み物","パンの名前","駄菓子","都道府県","国名",
    "有名人","家電","文房具","アプリ名","サイト名",
    "家具","ブランド名","職業","料理","スポーツ","動物","野菜","果物"
];

document.getElementById("freeThemeInput").addEventListener("input", () => {
    const val = document.getElementById("freeThemeInput").value.trim();
    document.getElementById("freeThemeBtn").disabled = val === "";
});

document.getElementById("randomThemeBtn").onclick = () => {
    const theme = themeList[Math.floor(Math.random() * themeList.length)];
    socket.emit("selectTheme", theme);
    document.getElementById("themeWait").textContent = "選択中...";
};

document.getElementById("freeThemeBtn").onclick = () => {
    const val = document.getElementById("freeThemeInput").value.trim();
    if (!val) return;
    socket.emit("selectTheme", val);
    document.getElementById("themeWait").textContent = "選択中...";
};

socket.on("themeDecided", (data) => {
    const display = `お題：${data.theme}`;
    document.getElementById("themeDisplay").textContent = display;
    document.getElementById("watchTheme").textContent = display;
    if (isSpectator) return;

    const ptDisplay = document.getElementById("inputScoreDisplay");
    if (ptDisplay) {
        const lines = players.map(id => {
            const pt = scores[id] || 0;
            const ptText = targetScore > 0 ? `${pt}/${targetScore}pt` : `${pt}pt`;
            return `${playerNames[id]}：${ptText}`;
        });
        ptDisplay.textContent = lines.join("　");
    }

    showScreen("screenInput");
});

socket.on("rematchVoteUpdate", (data) => {
    document.getElementById("rematchVoteInfo").textContent =
        `再戦希望: ${data.votes}/${data.total}`;
});

socket.on("waitingRematch", () => {
    result.textContent = "相手の再戦待ち...";
    document.getElementById("rematchBtn").hidden = true;
});

socket.on("rematchReady", () => {
    AudioManager.playBGM('lobby');
    stopCountdown();
    checkButton.disabled = false;
    usedKana = [];
    currentIndex = 0;
    answer = [];
    answered = false;
    eliminated = [];
    turnOrder = [];

    keyboard2.querySelectorAll("button").forEach(btn => {
        btn.disabled = false;
        btn.style.backgroundColor = "";
    });

    document.querySelectorAll("#watchKeyboard button").forEach(btn => {
        btn.style.backgroundColor = "";
        btn.style.color = "";
        btn.style.border = "";
    });

    inputs.forEach(i => i.value = "");
    updateSelection();

    document.getElementById("battleLog").innerHTML = "";
    document.getElementById("rematchBtn").hidden = true;
    document.getElementById("rematchVoteInfo").textContent = "";
    document.getElementById("themeDisplay").textContent = "";
    document.getElementById("themeWait").textContent = "";
    document.getElementById("watchTheme").textContent = "";
    document.getElementById("freeThemeInput").value = "";
    document.getElementById("freeThemeBtn").disabled = true;
    document.getElementById("allPlayersArea").innerHTML = "";
    const oldWord = document.getElementById("myWordDisplay");
    if (oldWord) oldWord.remove();
    showScreen("screenTheme");
});

document.getElementById("rematchBtn").onclick = () => {
    socket.emit("rematch");
    document.getElementById("rematchBtn").hidden = true;
};

// =====================
// 観戦参加
// =====================
document.getElementById("watchRoom").onclick = () => {
    const playerName = document.getElementById("nameInput2").value || "観戦者";
    isSpectator = true;
    socket.emit("watchRoom", roomInput.value, playerName);
};

socket.on("joinedAsSpectator", (data) => {
    document.getElementById("watchInfo").textContent = `部屋ID: ${data.roomId} を観戦中`;
    if (data.theme) {
        document.getElementById("watchTheme").textContent = `お題：${data.theme}`;
    }
    showScreen("screenWatch");
});

socket.on("spectatorGameStart", (data) => {
    const watchArea = document.getElementById("watchPlayersArea");
    watchArea.innerHTML = "";

    data.players.forEach(id => {
        const wrapper = document.createElement("div");
        wrapper.id = "watchArea-" + id;

        const label = document.createElement("p");
        label.textContent = data.playerNames[id];
        label.style.fontWeight = "bold";
        wrapper.appendChild(label);

        const cardsDiv = document.createElement("div");
        cardsDiv.classList.add("cards");
        const len = data.lengths[id] || 7;
        for (let i = 0; i < len; i++) {
            const card = document.createElement("div");
            card.classList.add("card");
            card.textContent = "？";
            card.id = `wcard-${id}-${i}`;
            cardsDiv.appendChild(card);
        }
        wrapper.appendChild(cardsDiv);
        watchArea.appendChild(wrapper);
    });

    document.getElementById("watchTheme").textContent = `お題：${data.theme}`;
    updateTurnPanel(data.turnOrder[0], data.turnOrder, data.playerNames, []);
    showScreen("screenWatch");
});

socket.on("spectatorAttack", (data) => {
    Object.entries(data.hitResults).forEach(([id, indexes]) => {
        indexes.forEach(i => {
            const card = document.getElementById(`wcard-${id}-${i}`);
            if (card) { card.textContent = data.kana; card.classList.add("opened"); }
        });
    });

    const wkBtn = document.getElementById("wk-" + data.kana);
    if (wkBtn) {
        wkBtn.style.backgroundColor = data.hitAny ? "#27ae60" : "#aaa";
        wkBtn.style.color = data.hitAny ? "#fff" : "#666";
        wkBtn.style.borderColor = data.hitAny ? "#1e8449" : "#999";
    }

    const log = document.getElementById("watchLog");
    const line = document.createElement("p");
    const attackerName = data.playerNames[data.attacker] || "?";
    if (data.hitSelf && data.hitAny) {
        line.textContent = `⚔️ ${attackerName}→「${data.kana}」ヒット＋自爆`;
    } else if (data.hitSelf) {
        line.textContent = `💥 ${attackerName}→「${data.kana}」自爆`;
    } else if (data.hitAny) {
        line.textContent = `⚔️ ${attackerName}→「${data.kana}」ヒット！`;
    } else {
        line.textContent = `❌ ${attackerName}→「${data.kana}」ミス`;
    }
    log.prepend(line);

    if (data.newlyEliminated) {
        data.newlyEliminated.forEach(id => {
            const area = document.getElementById("watchArea-" + id);
            if (area) area.style.opacity = "0.4";
        });
    }

    const watchEliminated = data.newlyEliminated || [];
    updateTurnPanel(data.nextTurn, data.players, data.playerNames, watchEliminated);
});

socket.on("spectatorGameEnd", (data) => {
    const log = document.getElementById("watchLog");
    const line = document.createElement("p");
    line.style.fontWeight = "bold";
    line.style.color = "#c0392b";
    line.textContent = `🏆 ${data.winnerName} の勝利！`;
    log.prepend(line);
    document.getElementById("watchInfo").textContent = `🏆 ${data.winnerName} の勝利！`;
    hideTurnPanel();
});

socket.on("errorMessage", (msg) => {
    roomInfo.textContent = "エラー: " + msg;
});

socket.on("connect", () => {
    console.log("connected:", socket.id);
});

// =====================
// 音量コントロールパネル
// =====================
(function buildVolumePanel() {
    const savedBgm = parseFloat(localStorage.getItem('vol_bgm') ?? '0.15');
    const savedSe  = parseFloat(localStorage.getItem('vol_se')  ?? '0.25');
    AudioManager._bgmVolume = savedBgm;
    AudioManager._seVolume  = savedSe;
    if (AudioManager.bgm) AudioManager.bgm.volume = savedBgm;

    const panel = document.createElement('div');
    panel.id = 'volumePanel';
    panel.style.cssText = `
        position: fixed; top: 16px; right: 16px; z-index: 300;
        display: flex; flex-direction: column; align-items: flex-end; gap: 4px;
    `;

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '🔊';
    toggleBtn.title = '音量調節';
    toggleBtn.style.cssText = `
        width: 38px; height: 38px; font-size: 18px;
        padding: 0; border-radius: 50%; cursor: pointer;
        background: rgba(255,248,235,0.92); border: 2px solid #c8965a;
        box-shadow: 0 2px 8px rgba(80,40,0,0.2); margin: 0;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
        background: rgba(255,248,235,0.97); border: 2px solid #c8965a;
        border-radius: 10px; padding: 12px 16px; min-width: 180px;
        box-shadow: 0 4px 16px rgba(80,40,0,0.2); display: none;
        flex-direction: column; gap: 10px;
    `;

    function makeRow(label, storageKey, initialVal, onChange) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
        const lbl = document.createElement('label');
        lbl.style.cssText = 'font-size:12px; color:#5a2d00; font-weight:bold;';
        lbl.textContent = label;
        const sliderWrap = document.createElement('div');
        sliderWrap.style.cssText = 'display:flex; align-items:center; gap:4px;';
        const minusBtn = document.createElement('button');
        minusBtn.textContent = '－';
        minusBtn.style.cssText = `width:24px;height:24px;font-size:14px;padding:0;border-radius:4px;cursor:pointer;margin:0;background:#fff8ef;border:2px solid #c8965a;box-shadow:0 2px 0 #a07040;color:#5a2d00;flex-shrink:0;`;
        const slider = document.createElement('input');
        slider.type = 'range'; slider.min = '0'; slider.max = '1'; slider.step = '0.01';
        slider.value = initialVal;
        slider.style.cssText = 'flex:1; accent-color:#c8813a; cursor:pointer;';
        const plusBtn = document.createElement('button');
        plusBtn.textContent = '＋';
        plusBtn.style.cssText = minusBtn.style.cssText;
        const valLabel = document.createElement('span');
        valLabel.style.cssText = 'font-size:12px; color:#5a2d00; width:32px; text-align:right;';
        valLabel.textContent = Math.round(initialVal * 100) + '%';
        function applyValue(v) {
            v = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
            slider.value = v;
            valLabel.textContent = Math.round(v * 100) + '%';
            localStorage.setItem(storageKey, v);
            onChange(v);
        }
        slider.addEventListener('input', () => applyValue(parseFloat(slider.value)));
        minusBtn.addEventListener('click', e => { e.stopPropagation(); applyValue(parseFloat(slider.value) - 0.01); });
        plusBtn.addEventListener('click', e => { e.stopPropagation(); applyValue(parseFloat(slider.value) + 0.01); });
        sliderWrap.appendChild(minusBtn);
        sliderWrap.appendChild(slider);
        sliderWrap.appendChild(plusBtn);
        sliderWrap.appendChild(valLabel);
        row.appendChild(lbl);
        row.appendChild(sliderWrap);
        return row;
    }

    box.appendChild(makeRow('🎵 BGM', 'vol_bgm', savedBgm, v => {
        AudioManager._bgmVolume = v;
        if (AudioManager.bgm) AudioManager.bgm.volume = v;
    }));
    box.appendChild(makeRow('🔔 SE', 'vol_se', savedSe, v => {
        AudioManager._seVolume = v;
    }));

    toggleBtn.addEventListener('click', e => {
        e.stopPropagation();
        box.style.display = box.style.display === 'none' ? 'flex' : 'none';
    });
    document.addEventListener('click', () => { box.style.display = 'none'; });
    box.addEventListener('click', e => e.stopPropagation());

    panel.appendChild(toggleBtn);
    panel.appendChild(box);
    document.body.appendChild(panel);
})();

const refreshBtn = document.getElementById("refreshRoomList");
if (refreshBtn) {
    refreshBtn.onclick = () => {
        socket.emit("getRoomList");
    };
}

socket.on("roomList", (list) => {
    const container = document.getElementById("roomListContainer");
    container.style.display = "block";
    container.innerHTML = "";

    if (list.length === 0) {
        container.innerHTML = `<p style="padding:12px; color:#888;">待機中のルームはありません</p>`;
        return;
    }

    list.forEach(room => {
        const row = document.createElement("div");
        row.style.cssText = `
            display: flex; align-items: center; justify-content: space-between;
            padding: 10px 14px; border-bottom: 1px solid #e0e8ff;
            cursor: pointer; transition: background 0.1s;
        `;
        row.innerHTML = `
            <span style="font-weight:bold; color:#5a2d6a;">${room.roomId}</span>
            <span style="color:#7b5ea7;">👑 ${room.hostName}</span>
            <span style="color:#5a2d6a;">👥 ${room.playerCount}/8人</span>
        `;
        row.onclick = () => {
            document.getElementById("roomInput").value = room.roomId;
            container.querySelectorAll("div").forEach(r => r.style.background = "");
            row.style.background = "rgba(160,120,255,0.2)";
        };
        row.onmouseover = () => row.style.background = "rgba(160,120,255,0.1)";
        row.onmouseout = () => {
            if (document.getElementById("roomInput").value !== room.roomId) {
                row.style.background = "";
            }
        };
        container.appendChild(row);
    });
});

// スタートボタン → ルーム画面へ
document.getElementById("startBtn").onclick = () => {
    showScreen("screenRoom");
};

// タイトル画面から開始
showScreen("screenTitle");