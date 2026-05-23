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
    ["screenRoom","screenWait","screenInput","screenBattle"].forEach(s => {
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
            // バトル時はDEL・×・ー押せない
        };
        container.appendChild(btn);
    });
}

buildKeyboard(keyboard, "input");
buildSpecialKeyboard(specialKeyboard, "input");
buildKeyboard(keyboard2, "battle");
// バトル画面には特殊キー不要なので生成しない

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
    result.textContent = myTurn ? "あなたのターン！" : "相手のターン...";
}

// =====================
// ルーム作成
// =====================
createRoomBtn.onclick = () => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    roomInput.value = roomId;
    socket.emit("createRoom", roomId);
};

// =====================
// ルーム参加
// =====================
joinRoomBtn.onclick = () => {
    socket.emit("joinRoom", roomInput.value);
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
    showScreen("screenInput");
});

// =====================
// 単語確定
// =====================
checkButton.onclick = () => {
    answer = Array.from(inputs).map(i => i.value || "×");
    socket.emit("setAnswer", answer);
    result.textContent = "相手の入力待ち...";
};

// =====================
// socket：ゲーム開始
// （先攻＝部屋作成者、後攻＝参加者）
// =====================
socket.on("gameStart", (data) => {
    console.log("gameStart data:", data);
    buildBattleCards(data.opponentLength);
    buildMyCards();
    showScreen("screenBattle");
    myTurn = data.firstTurn === socket.id;
    updateTurnDisplay();
});

// =====================
// socket：攻撃結果（自分が攻撃）
// =====================
socket.on("attackResult", (data) => {
    // 相手カード更新
    data.hitIndexes.forEach(i => {
        const card = document.getElementById("bc-" + i);
        if (card) card.textContent = data.kana;
    });
    // 自爆カード更新
    data.hitSelfIndexes.forEach(i => {
        const card = document.getElementById("mc-" + i);
        if (card) card.textContent = data.kana;
    });

    if (data.hitSelf && data.hit) {
        result.textContent = "ヒット！でも自爆... ターン交代";
    } else if (data.hitSelf) {
        result.textContent = "自爆！ターン交代";
    } else if (data.hit) {
        result.textContent = "ヒット！続けて攻撃！";
    } else {
        result.textContent = "ミス... ターン交代";
    }

    myTurn = !data.turnChanged;
});

socket.on("attacked", (data) => {
    // 相手の自爆で自分のカードが開く
    data.hitSelfIndexes.forEach(i => {
        const card = document.getElementById("bc-" + i);
        if (card) card.textContent = data.kana;
    });
    // 自分が被弾
    data.hitIndexes.forEach(i => {
        const card = document.getElementById("mc-" + i);
        if (card) card.textContent = data.kana;
    });

    // 使用済みキーをグレーに
    const btns = keyboard2.querySelectorAll("button");
    btns.forEach(btn => {
        if (btn.textContent === data.kana) {
            btn.disabled = true;
            btn.style.backgroundColor = "gray";
        }
    });
    
    myTurn = data.turnChanged;
    updateTurnDisplay();
});
// =====================
// socket：ゲーム終了
// =====================
socket.on("gameEnd", (data) => {
    if (data.winner === socket.id) {
        result.textContent = "🎉 あなたの勝ち！";
    } else {
        result.textContent = "💀 あなたの負け...";
    }
    myTurn = false;
});

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