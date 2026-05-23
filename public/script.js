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
const specialKeyboard2 = document.getElementById("specialKeyboard2");

// =====================
// 状態
// =====================
let currentIndex = 0;
let answer = [];
let usedKana = [];
let myTurn = false;
let wins = 0;
let losses = 0;

// =====================
// 画面切り替え
// =====================
function showScreen(id) {
    ["screenRoom","screenWait","screenTheme","screenInput","screenBattle"].forEach(s => {
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
        result.style.color = "#00ff88";
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

// =====================
// socket：ルーム作成完了
// =====================
socket.on("roomCreated", (roomId) => {
    waitRoomId.textContent = "部屋ID: " + roomId;
    showScreen("screenWait");
});

// =====================
// socket：ルーム参加完了
// =====================
socket.on("joinedRoom", (roomId) => {
    waitRoomId.textContent = "部屋ID: " + roomId + " に参加しました";
    showScreen("screenWait");
});

// =====================
// socket：2人揃った
// =====================
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

    // 入力欄を伏せる
    inputs.forEach(i => {
        if (i.value && i.value !== "×") {
            i.value = "□";
        }
    });

    // 決定ボタンを無効化
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
    result.style.color = "#00ff88";
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
    "飲み物","パンの名前","冷凍食品","レトルト食品","駄菓子",
    "都道府県","市区町村","駅名","国名","世界遺産",
    "川の名前","山の名前","温泉地","空港名","路線名",
    "アニメタイトル","漫画タイトル","ゲームタイトル","映画タイトル","曲名",
    "アーティスト名","声優","Vtuber","YouTuber","芸人",
    "家電","文房具","アプリ名","サイト名","スマホゲーム",
    "家具","ブランド名","車種","電車","楽器",
    "職業","資格","教科","部活",
    "動物","魚","鳥","虫","花","野菜","果物"
];

// =====================
// お題選択ボタン
// =====================
document.getElementById("randomThemeBtn").onclick = () => {
    const theme = themeList[Math.floor(Math.random() * themeList.length)];
    socket.emit("selectTheme", theme);
    document.getElementById("themeWait").textContent = "選択中...";
};

document.getElementById("freeThemeBtn").onclick = () => {
    socket.emit("selectTheme", "自由");
    document.getElementById("themeWait").textContent = "選択中...";
};

// =====================
// お題確定
// =====================
socket.on("themeDecided", (data) => {
    const display = data.theme === "自由"
        ? "自由入力"
        : `お題：${data.theme}`;
    document.getElementById("themeDisplay").textContent = display;
    showScreen("screenInput");
});

// =====================
// socket：再戦待ち
// =====================
socket.on("waitingRematch", () => {
    result.textContent = "相手の再戦待ち...";
    document.getElementById("rematchBtn").hidden = true;
});

// =====================
// socket：再戦開始
// =====================
socket.on("rematchReady", () => {
    checkButton.disabled = false;
    usedKana = [];
    currentIndex = 0;
    answer = [];

    keyboard2.querySelectorAll("button").forEach(btn => {
        btn.disabled = false;
        btn.style.backgroundColor = "";
    });

    inputs.forEach(i => i.value = "");
    updateSelection();

    document.getElementById("battleLog").innerHTML = "";
    document.getElementById("rematchBtn").hidden = true;
    document.getElementById("scoreInput").textContent = `${wins}勝 ${losses}敗`;
    document.getElementById("themeDisplay").textContent = "";
    document.getElementById("themeWait").textContent = "";
    showScreen("screenTheme");
});

// =====================
// 再戦ボタン
// =====================
document.getElementById("rematchBtn").onclick = () => {
    socket.emit("rematch");
};

// =====================
// socket：エラー
// =====================
socket.on("errorMessage", (msg) => {
    roomInfo.textContent = "エラー: " + msg;
});

// =====================
// デバッグ
// =====================
socket.on("connect", () => {
    console.log("connected:", socket.id);
});