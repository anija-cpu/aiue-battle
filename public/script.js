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
let isSpectator = false; // ← 追加：観戦者フラグ

// =====================
// 画面切り替え
// =====================
function showScreen(id) {
    ["screenRoom","screenWait","screenTheme","screenInput","screenBattle","screenWatch"].forEach(s => {
        document.getElementById(s).hidden = (s !== id);
    });
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
        inputs[currentIndex].value = "";
        if (currentIndex > 0) currentIndex--;
        updateSelection();
        return;
    }
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
        label.textContent = id === myId
            ? `自分：${playerNamesObj[id]}`
            : `${playerNamesObj[id]}`;
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
// ターン表示更新
// =====================
// ターンパネル更新（左上固定）
// =====================
function updateTurnPanel(currentTurnId, order, names, eliminatedList) {
    const panel = document.getElementById("turnPanel");
    const currentEl = document.getElementById("turnPanelCurrent");
    const orderEl = document.getElementById("turnPanelOrder");

    const currentName = (currentTurnId && names[currentTurnId]) || "？";
    currentEl.textContent = `⚔️ ${currentName}のターン`;

    // ターン順表示（脱落者はグレーアウト、自分は勝敗付き）
    orderEl.innerHTML = "";
    (order || []).forEach(id => {
        const span = document.createElement("span");
        const isMe = id === socket.id;
        span.textContent = (names[id] || id) + (isMe ? ` ${wins}勝${losses}敗` : "");
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
    document.getElementById("turnPanel").hidden = true;
}

// =====================
function updateTurnDisplay(currentTurnId) {
    if (myTurn) {
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
    waitRoomId.textContent = "部屋ID: " + roomId;
    showScreen("screenWait");
    document.getElementById("startGameBtn").hidden = false;
    document.getElementById("startInfo").textContent = "2人以上集まったらゲーム開始を押してください";
});

// =====================
// socket：ルーム参加完了
// =====================
socket.on("joinedRoom", (roomId) => {
    myRoomId = roomId;
    waitRoomId.textContent = "部屋ID: " + roomId + " に参加しました";
    showScreen("screenWait");
    document.getElementById("startGameBtn").hidden = true;
    document.getElementById("startInfo").textContent = "部屋主がゲームを開始するのを待っています...";
});

// =====================
// socket：部屋情報更新
// =====================
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

// =====================
// ゲーム開始ボタン
// =====================
document.getElementById("startGameBtn").onclick = () => {
    socket.emit("startGame");
};

// =====================
// socket：2人以上揃った
// =====================
socket.on("ready", (data) => {
    turnOrder = data.turnOrder;
    playerNames = data.playerNames;
    showScreen("screenTheme");
});

// =====================
// 単語確定
// =====================
checkButton.onclick = () => {
    answer = Array.from(inputs).map(i => i.value || "×");
    const validCount = answer.filter(k => k !== "×").length;
    if (validCount < 2) {
        alert("2文字以上入力してください！");
        return;
    }
    socket.emit("setAnswer", answer);
    inputs.forEach(i => {
        if (i.value && i.value !== "×") i.value = "□";
    });
    checkButton.disabled = true;
    result.textContent = "単語を設定しました！全員の入力を待っています...";
};

// =====================
// socket：ゲーム開始
// =====================
socket.on("gameStart", (data) => {
    turnOrder = data.turnOrder;
    playerNames = data.playerNames;
    players = data.players;
    eliminated = [];
    document.getElementById("battleTheme").textContent = `お題：${data.theme}`;
    buildAllPlayerCards(data.players, data.playerNames, data.opponentLengths, socket.id);
    showScreen("screenBattle");
    myTurn = data.firstTurn === socket.id;

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

    updateTurnDisplay(data.firstTurn);
    updateTurnPanel(data.firstTurn, data.turnOrder, data.playerNames, []);
    addLog(`ターン順: ${data.turnOrder.map(id => data.playerNames[id]).join(" → ")}`);
});

// =====================
// socket：攻撃結果（自分が攻撃）
// =====================
socket.on("attackResult", (data) => {
    Object.entries(data.hitResults).forEach(([id, indexes]) => {
        indexes.forEach(i => {
            const card = document.getElementById(`card-${id}-${i}`);
            if (card) { card.textContent = data.kana; card.classList.add("opened"); }
        });
    });

    if (data.hitSelf && data.hitAny) {
        addLog(`⚔️ 自分→「${data.kana}」ヒット＋自爆 ターン交代`);
        result.textContent = "ヒット！でも自爆... ターン交代";
        result.style.color = "#888";
    } else if (data.hitSelf) {
        addLog(`💥 自分→「${data.kana}」自爆 ターン交代`);
        result.textContent = "自爆！ターン交代";
        result.style.color = "#888";
    } else if (data.hitAny) {
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
    if (data.turnChanged) {
        document.getElementById("keyboardArea2").classList.add("disabled");
        addLog(`→ ${playerNames[data.nextTurn]}のターン`);
        updateTurnPanel(data.nextTurn, turnOrder, playerNames, eliminated);
    } else {
        document.getElementById("keyboardArea2").classList.remove("disabled");
        updateTurnPanel(socket.id, turnOrder, playerNames, eliminated);
    }
});

// =====================
// socket：被弾（他プレイヤーが攻撃）
// =====================
socket.on("attacked", (data) => {
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
        addLog(`⚔️ ${attackerName}→「${data.kana}」ヒット＋自爆`);
    } else if (data.hitSelf) {
        addLog(`💥 ${attackerName}→「${data.kana}」自爆`);
    } else if (data.hitAny) {
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
    addLog(`→ ${playerNames[data.nextTurn]}のターン`);
    updateTurnDisplay(data.nextTurn);
    updateTurnPanel(data.nextTurn, turnOrder, playerNames, eliminated);
});

// =====================
// socket：ゲーム終了
// =====================
socket.on("gameEnd", (data) => {
    if (data.winner === socket.id) {
        wins++;
        result.textContent = "🎉 あなたの勝ち！";
        addLog("🎉 ゲーム終了 - あなたの勝ち！");
    } else {
        losses++;
        result.textContent = `💀 ${data.winnerName} の勝ち！`;
        addLog(`🏆 ゲーム終了 - ${data.winnerName} の勝利！`);
    }
    myTurn = false;
    hideTurnPanel();
    document.getElementById("rematchBtn").hidden = false;
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

// お題確定（バグ修正①：isSpectatorフラグで判定）
socket.on("themeDecided", (data) => {
    const display = `お題：${data.theme}`;
    document.getElementById("themeDisplay").textContent = display;
    document.getElementById("watchTheme").textContent = display;
    if (isSpectator) return; // 観戦者は画面遷移しない
    showScreen("screenInput");
});

// =====================
// 再戦
// =====================
socket.on("rematchVoteUpdate", (data) => {
    document.getElementById("rematchVoteInfo").textContent =
        `再戦希望: ${data.votes}/${data.total}`;
});

socket.on("waitingRematch", () => {
    result.textContent = "相手の再戦待ち...";
    document.getElementById("rematchBtn").hidden = true;
});

socket.on("rematchReady", () => {
    checkButton.disabled = false;
    usedKana = [];
    currentIndex = 0;
    answer = [];
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
    isSpectator = true; // ← 観戦者フラグをセット
    socket.emit("watchRoom", roomInput.value, playerName);
};

socket.on("joinedAsSpectator", (data) => {
    document.getElementById("watchInfo").textContent = `部屋ID: ${data.roomId} を観戦中`;
    if (data.theme) {
        document.getElementById("watchTheme").textContent = `お題：${data.theme}`;
    }
    showScreen("screenWatch");
});

// =====================
// 観戦：ゲーム開始（バグ修正②：watchAreaを専用divにする）
// =====================
socket.on("spectatorGameStart", (data) => {
    const watchArea = document.getElementById("watchPlayersArea"); // ← 専用divを使う

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
    showScreen("screenWatch"); // 観戦画面に遷移
});

// =====================
// 観戦：攻撃更新
// =====================
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

    // 観戦側でも脱落リストを追跡してパネル更新
    const watchEliminated = data.newlyEliminated || [];
    updateTurnPanel(data.nextTurn, data.players, data.playerNames, watchEliminated);
});

// =====================
// 観戦：ゲーム終了
// =====================
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

// =====================
// socket：エラー
// =====================
socket.on("errorMessage", (msg) => {
    roomInfo.textContent = "エラー: " + msg;
});

socket.on("connect", () => {
    console.log("connected:", socket.id);
});