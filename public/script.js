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
const battleCards = document.getElementById("battleCards");
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

// 観戦用
let watchPlayer1Id = null;
let watchPlayer2Id = null;

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
    if (inputs[currentIndex]) {
        inputs[currentIndex].classList.add("selected");
    }
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
// キーボード生成（共通）
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
        if (mode === "watch") btn.id = "wk-" + kana;
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

// 観戦用キーボード（クリック不可・色変えのみ）
function buildWatchKeyboard(container) {
    kanaList.forEach(kana => {
        if (!kana) {
            container.appendChild(document.createElement("div"));
            return;
        }
        const btn = document.createElement("button");
        btn.textContent = kana;
        btn.disabled = true;
        btn.id = "wk-" + kana;
        container.appendChild(btn);
    });
}

buildKeyboard(keyboard, "input");
buildSpecialKeyboard(specialKeyboard, "input");
buildKeyboard(keyboard2, "battle");
buildKeyboard(document.getElementById("watchKeyboard"), "watch");

// =====================
// バトル画面：相手カード生成
// =====================
function buildBattleCards(length) {
    battleCards.innerHTML = "";
    for (let i = 0; i < length; i++) {
        const card = document.createElement("div");
        card.classList.add("card");
        card.textContent = "？";
        card.id = "bc-" + i;
        battleCards.appendChild(card);
    }
}

function buildMyCards() {
    const myCards = document.getElementById("myCards");
    myCards.innerHTML = "";
    answer.forEach((kana, i) => {
        const card = document.createElement("div");
        card.classList.add("card");
        card.textContent = "？";
        card.id = "mc-" + i;
        myCards.appendChild(card);
    });
}

// =====================
// ターン表示更新
// =====================
function updateTurnDisplay() {
    if (myTurn) {
        result.textContent = "⚔️ あなたのターン！";
        result.style.color = "#c0392b";
        document.getElementById("keyboardArea2").classList.remove("disabled");
    } else {
        result.textContent = "🛡️ 相手のターン...";
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
// ルーム作成
// =====================
createRoomBtn.onclick = () => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    roomInput.value = roomId;
    const playerName = document.getElementById("nameInput").value || "プレイヤー1";
    socket.emit("createRoom", roomId, playerName);
};

joinRoomBtn.onclick = () => {
    const playerName = document.getElementById("nameInput2").value || "プレイヤー2";
    socket.emit("joinRoom", roomInput.value, playerName);
};

socket.on("roomCreated", (roomId) => {
    waitRoomId.textContent = "部屋ID: " + roomId;
    showScreen("screenWait");
});

socket.on("joinedRoom", (roomId) => {
    waitRoomId.textContent = "部屋ID: " + roomId + " に参加しました";
    showScreen("screenWait");
});

socket.on("ready", () => {
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
    result.textContent = "単語を設定しました！相手の入力を待っています...";
};

// =====================
// socket：ゲーム開始
// =====================
socket.on("gameStart", (data) => {
    buildBattleCards(data.opponentLength);
    buildMyCards();
    document.getElementById("myName").textContent = `自分：${data.myName}`;
    document.getElementById("opponentName").textContent = `相手：${data.opponentName}`;
    document.getElementById("battleTheme").textContent = `お題：${data.theme}`;
    showScreen("screenBattle");
    myTurn = data.firstTurn === socket.id;
    updateTurnDisplay();
});

// =====================
// socket：攻撃結果（自分が攻撃）
// =====================
socket.on("attackResult", (data) => {
    data.hitIndexes.forEach(i => {
        const card = document.getElementById("bc-" + i);
        if (card) card.textContent = data.kana;
    });
    data.hitSelfIndexes.forEach(i => {
        const card = document.getElementById("mc-" + i);
        if (card) card.textContent = data.kana;
    });

    if (data.hitSelf && data.hit) {
        result.textContent = "ヒット！でも自爆... ターン交代";
        result.style.color = "#888888";
        addLog(`⚔️ 自分→「${data.kana}」ヒット＋自爆 ターン交代`);
    } else if (data.hitSelf) {
        result.textContent = "自爆！ターン交代";
        result.style.color = "#888888";
        addLog(`💥 自分→「${data.kana}」自爆 ターン交代`);
    } else if (data.hit) {
        result.textContent = "ヒット！続けて攻撃！";
        result.style.color = "#c0392b";
        addLog(`⚔️ 自分→「${data.kana}」ヒット！`);
    } else {
        result.textContent = "ミス... ターン交代";
        result.style.color = "#888888";
        addLog(`❌ 自分→「${data.kana}」ミス ターン交代`);
    }

    myTurn = !data.turnChanged;
    if (data.turnChanged) {
        document.getElementById("keyboardArea2").classList.add("disabled");
    } else {
        document.getElementById("keyboardArea2").classList.remove("disabled");
    }
});

// =====================
// socket：被弾（相手が攻撃）
// =====================
socket.on("attacked", (data) => {
    data.hitSelfIndexes.forEach(i => {
        const card = document.getElementById("bc-" + i);
        if (card) card.textContent = data.kana;
    });
    data.hitIndexes.forEach(i => {
        const card = document.getElementById("mc-" + i);
        if (card) card.textContent = data.kana;
    });

    const btns = keyboard2.querySelectorAll("button");
    btns.forEach(btn => {
        if (btn.textContent === data.kana) {
            btn.disabled = true;
            btn.style.backgroundColor = "gray";
        }
    });

    if (data.hitSelf && data.hit) {
        addLog(`🛡️ 相手→「${data.kana}」ヒット＋自爆 あなたのターンへ`);
    } else if (data.hitSelf) {
        addLog(`💥 相手→「${data.kana}」自爆 あなたのターンへ`);
    } else if (data.hit) {
        addLog(`🛡️ 相手→「${data.kana}」被弾！`);
    } else {
        addLog(`❌ 相手→「${data.kana}」ミス あなたのターンへ`);
    }

    myTurn = data.turnChanged;
    updateTurnDisplay();
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
        result.textContent = "💀 あなたの負け...";
        addLog("💀 ゲーム終了 - あなたの負け...");
    }
    myTurn = false;
    document.getElementById("score").textContent = `${wins}勝 ${losses}敗`;
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

// 入力ボックスに文字が入ったら自由ボタンを有効化
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

// お題確定（プレイヤー・観戦者共通）
socket.on("themeDecided", (data) => {
    const display = `お題：${data.theme}`;
    document.getElementById("themeDisplay").textContent = display;
    document.getElementById("watchTheme").textContent = display;

    // 観戦者は画面遷移しない
    if (!document.getElementById("screenWatch").hidden) return;
    showScreen("screenInput");
});

// =====================
// 再戦
// =====================
socket.on("waitingRematch", () => {
    result.textContent = "相手の再戦待ち...";
    document.getElementById("rematchBtn").hidden = true;
});

socket.on("rematchReady", () => {
    document.getElementById("freeThemeInput").value = "";
    document.getElementById("freeThemeBtn").disabled = true;
    
    checkButton.disabled = false;
    usedKana = [];
    currentIndex = 0;
    answer = [];

    keyboard2.querySelectorAll("button").forEach(btn => {
        btn.disabled = false;
        btn.style.backgroundColor = "";
    });

    // 観戦キーボードもリセット
    document.querySelectorAll("#watchKeyboard button").forEach(btn => {
        btn.style.backgroundColor = "";
        btn.style.color = "";
        btn.style.border = "";
    });

    inputs.forEach(i => i.value = "");
    updateSelection();

    document.getElementById("battleLog").innerHTML = "";
    document.getElementById("rematchBtn").hidden = true;
    document.getElementById("scoreInput").textContent = `${wins}勝 ${losses}敗`;
    document.getElementById("themeDisplay").textContent = "";
    document.getElementById("themeWait").textContent = "";
    document.getElementById("watchTheme").textContent = "";
    showScreen("screenTheme");
});

document.getElementById("rematchBtn").onclick = () => {
    socket.emit("rematch");
};

// =====================
// 観戦参加
// =====================
document.getElementById("watchRoom").onclick = () => {
    const playerName = document.getElementById("nameInput2").value || "観戦者";
    socket.emit("watchRoom", roomInput.value, playerName);
};

socket.on("joinedAsSpectator", (data) => {
    document.getElementById("watchInfo").textContent = `部屋ID: ${data.roomId} を観戦中`;

    // 参加時点でお題がすでに決まっていれば表示
    if (data.theme) {
        const display = data.theme === "自由" ? "自由入力" : `お題：${data.theme}`;
        document.getElementById("watchTheme").textContent = display;
    }

    showScreen("screenWatch");
});

// =====================
// 観戦：ゲーム開始
// =====================
socket.on("spectatorGameStart", (data) => {
    watchPlayer1Id = data.player1;
    watchPlayer2Id = data.player2;

    // お題表示
    if (data.theme) {
        const display = data.theme === "自由" ? "自由入力" : `お題：${data.theme}`;
        document.getElementById("watchTheme").textContent = display;
    }

    const w1 = document.getElementById("watchCards1");
    w1.innerHTML = "";
    for (let i = 0; i < data.length1; i++) {
        const card = document.createElement("div");
        card.classList.add("card");
        card.textContent = "？";
        card.id = "wc1-" + i;
        w1.appendChild(card);
    }
    const w2 = document.getElementById("watchCards2");
    w2.innerHTML = "";
    for (let i = 0; i < data.length2; i++) {
        const card = document.createElement("div");
        card.classList.add("card");
        card.textContent = "？";
        card.id = "wc2-" + i;
        w2.appendChild(card);
    }
    document.getElementById("watchPlayer1Name").textContent = data.name1;
    document.getElementById("watchPlayer2Name").textContent = data.name2;
    showScreen("screenWatch");
});

// =====================
// 観戦：攻撃更新
// =====================
socket.on("spectatorAttack", (data) => {
    const attackerIsP1 = data.attacker === data.players[0];

    // defender（相手）のカードにヒット表示
    data.hitDefenderIndexes.forEach(i => {
        const id = attackerIsP1 ? "wc2-" + i : "wc1-" + i;
        const card = document.getElementById(id);
        if (card) card.textContent = data.kana;
    });

    // attacker（自分）のカードに自爆表示
    data.hitSelfIndexes.forEach(i => {
        const id = attackerIsP1 ? "wc1-" + i : "wc2-" + i;
        const card = document.getElementById(id);
        if (card) card.textContent = data.kana;
    });

    // 観戦キーボードに色付け
    const wkBtn = document.getElementById("wk-" + data.kana);
    if (wkBtn) {
        if (data.hitDefender) {
            // ヒット → 緑
            wkBtn.style.backgroundColor = "#27ae60";
            wkBtn.style.color = "#fff";
            wkBtn.style.borderColor = "#1e8449";
        } else {
            // ミス → グレー
            wkBtn.style.backgroundColor = "#aaa";
            wkBtn.style.color = "#666";
            wkBtn.style.borderColor = "#999";
        }
    }

    // ログ
    const log = document.getElementById("watchLog");
    const line = document.createElement("p");
    const attackerName = attackerIsP1
        ? document.getElementById("watchPlayer1Name").textContent
        : document.getElementById("watchPlayer2Name").textContent;

    if (data.hitSelf && data.hitDefender) {
        line.textContent = `⚔️ ${attackerName}→「${data.kana}」ヒット＋自爆`;
    } else if (data.hitSelf) {
        line.textContent = `💥 ${attackerName}→「${data.kana}」自爆`;
    } else if (data.hitDefender) {
        line.textContent = `⚔️ ${attackerName}→「${data.kana}」ヒット！`;
    } else {
        line.textContent = `❌ ${attackerName}→「${data.kana}」ミス`;
    }
    log.prepend(line);
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