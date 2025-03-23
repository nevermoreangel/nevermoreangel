const TelegramBot = require("node-telegram-bot-api");
const dotenv = require("dotenv");
const http = require("http");
const sqlite3 = require("sqlite3").verbose();

// Загрузка переменных окружения
dotenv.config();

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  throw new Error("Токен не найден в .env! Проверь файл и путь.");
}
console.log("Токен загружен!");

// Константы
const CREATOR_ID = 6246960983; // Твой ID
const CHANNEL_ID = -1002245801117;

// Инициализация бота
const bot = new TelegramBot(TOKEN, { polling: true });

// Подключение к базе данных SQLite
const db = new sqlite3.Database("./database.db", (err) => {
  if (err) {
    console.error("Ошибка подключения к базе данных:", err);
  } else {
    console.log("Подключение к базе данных успешно!");
    // Создаём таблицы, если они не существуют
    db.run(`
            CREATE TABLE IF NOT EXISTS photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id TEXT NOT NULL
            )
        `);
    db.run(`
            CREATE TABLE IF NOT EXISTS music (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id TEXT NOT NULL
            )
        `);
  }
});

// Состояния для обработки сообщений
let userStates = {};

// Объект для хранения времени последнего запроса
const lastRequestTime = {};

// Функция для отправки главного меню
const sendMainMenu = (chatId) => {
  const text =
    `**приветствую**! я бот-помощник __nevermoreangel's__\n` +
    "*мои команды:*\n" +
    "[ /start ] - главное меню\n" +
    "[ /contact ] - связь с создателем\n" +
    "[ /music ] - подобрать музон\n" +
    "[ /photo ] - подобрать аватарку\n" +
    "[ /donate ] - на пиво\n" +
    "[ /nevermore ] - инфа о проекте";
  bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
  console.log("Главное меню отправлено");
};

// Команда /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Проверка кулдауна (20 секунд), кроме создателя
  if (userId !== CREATOR_ID) {
    const currentTime = Date.now();
    if (
      lastRequestTime[userId] &&
      currentTime - lastRequestTime[userId] < 20 * 1000
    ) {
      bot.sendMessage(chatId, "Подождите немного прежде чем это сделать!");
      return;
    }
    lastRequestTime[userId] = currentTime;
  }

  sendMainMenu(chatId);
});

// Команда /contact
bot.onText(/\/contact/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Проверка кулдауна (20 секунд), кроме создателя
  if (userId !== CREATOR_ID) {
    const currentTime = Date.now();
    if (
      lastRequestTime[userId] &&
      currentTime - lastRequestTime[userId] < 20 * 1000
    ) {
      bot.sendMessage(chatId, "Подождите немного прежде чем это сделать!");
      return;
    }
    lastRequestTime[userId] = currentTime;
  }

  const text =
    "Отправить письмо создателю? (@nevermoreangel)\n" +
    "p.s. это нужно если у вас спамблок";
  const keyboard = {
    inline_keyboard: [[{ text: "Отправить", callback_data: "send_message" }]],
  };
  bot.sendMessage(chatId, text, { reply_markup: keyboard });
});

// Обработка callback-запросов
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (data === "send_message") {
    // Удаляем предыдущее сообщение
    bot.deleteMessage(chatId, query.message.message_id);

    // Переходим в режим ожидания письма
    userStates[userId] = { step: "awaiting_message" };
    bot.sendMessage(chatId, "Напишите письмо создателю.");
  } else if (data === "add_more") {
    // Пользователь хочет добавить ещё что-то
    userStates[userId] = { step: "awaiting_additional_message" };
    bot.sendMessage(chatId, "Отправьте текст, медиа или файл.");
  } else if (data === "send_final") {
    // Пользователь хочет отправить письмо
    const message = userStates[userId].message;
    const additionalMessage = userStates[userId].additionalMessage || "";

    // Отправляем письмо создателю
    const finalMessage =
      `Вам сообщение от ${
        query.from.username || "пользователь"
      } (${userId}):\n` + `${message}\n${additionalMessage}`;
    const keyboard = {
      inline_keyboard: [
        [{ text: "Ответить", callback_data: `reply_${userId}` }],
      ],
    };
    bot.sendMessage(CREATOR_ID, finalMessage, { reply_markup: keyboard });

    // Очищаем состояние
    delete userStates[userId];
    bot.sendMessage(chatId, "Ваше письмо отправлено создателю!");
  } else if (data.startsWith("reply_")) {
    // Создатель хочет ответить
    const targetUserId = data.split("_")[1];
    userStates[CREATOR_ID] = { step: "replying", targetUserId };
    bot.sendMessage(CREATOR_ID, "Напишите ответное сообщение:");
  }
});

// Обработка текстовых сообщений
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  if (userStates[userId] && userStates[userId].step === "awaiting_message") {
    // Пользователь отправляет письмо
    userStates[userId].message = text;
    userStates[userId].step = "awaiting_additional";

    const keyboard = {
      inline_keyboard: [
        [{ text: "Добавить ещё", callback_data: "add_more" }],
        [{ text: "Отправить", callback_data: "send_final" }],
      ],
    };
    bot.sendMessage(
      chatId,
      "Отлично! Хотите что-нибудь добавить? (текст, медиа, файл и т.д.)",
      { reply_markup: keyboard }
    );
  } else if (
    userStates[userId] &&
    userStates[userId].step === "awaiting_additional_message"
  ) {
    // Пользователь добавляет дополнительное сообщение
    userStates[userId].additionalMessage = text;
    userStates[userId].step = "awaiting_additional";

    const keyboard = {
      inline_keyboard: [
        [{ text: "Добавить ещё", callback_data: "add_more" }],
        [{ text: "Отправить", callback_data: "send_final" }],
      ],
    };
    bot.sendMessage(
      chatId,
      "Отлично! Хотите что-нибудь добавить? (текст, медиа, файл и т.д.)",
      { reply_markup: keyboard }
    );
  } else if (userStates[userId] && userStates[userId].step === "replying") {
    // Создатель отправляет ответ
    const targetUserId = userStates[userId].targetUserId;
    bot.sendMessage(targetUserId, `Вам ответ от создателя:\n${text}`);
    delete userStates[userId];
    bot.sendMessage(chatId, "Ваше сообщение отправлено!");
  }
});

// Команда /nevermore
bot.onText(/\/nevermore/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Проверка кулдауна (20 секунд), кроме создателя
  if (userId !== CREATOR_ID) {
    const currentTime = Date.now();
    if (
      lastRequestTime[userId] &&
      currentTime - lastRequestTime[userId] < 20 * 1000
    ) {
      bot.sendMessage(chatId, "Подождите немного прежде чем это сделать!");
      return;
    }
    lastRequestTime[userId] = currentTime;
  }

  const text =
    "**_by nevermoreangel_**\n" +
    "— *owner (создатель)* - t.me/nevermoreangel\n" +
    "— *bio (биография)* - t.me/nevermoredivinebio\n" +
    "— *channel (канал)* - t.me/nevermoredivine\n" +
    "— *other (другое)* - t.me/nevermoreangels";
  bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
  console.log("Команда /nevermore выполнена");
});

// Команда /donate
bot.onText(/\/donate/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Проверка кулдауна (20 секунд), кроме создателя
  if (userId !== CREATOR_ID) {
    const currentTime = Date.now();
    if (
      lastRequestTime[userId] &&
      currentTime - lastRequestTime[userId] < 20 * 1000
    ) {
      bot.sendMessage(chatId, "Подождите немного прежде чем это сделать!");
      return;
    }
    lastRequestTime[userId] = currentTime;
  }

  const text = "оп нихYя себе я могу скинуть неверу на ПИВАС???";
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "Карта Тбанк",
          url: "https://www.tinkoff.ru/rm/r_GNIEdHjblt.iqbpayQgVJ/wLrWN62469",
        },
      ],
    ],
  };
  bot.sendMessage(chatId, text, { reply_markup: keyboard });
  bot.sendMessage(
    chatId,
    "после оплаты можешь оставить сообщение создателю через /contact!"
  );
  console.log("Команда /donate выполнена");
});

// Команда /admin
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId !== CREATOR_ID) {
    bot.sendMessage(chatId, "доступ только для создателя!");
    return;
  }

  const text =
    "**_админ-панель_**\n" +
    "— /addphoto - добавить фото\n" +
    "— /addmusic - добавить музыку\n" +
    "— /delphoto - удалить все фото\n" +
    "— /delmusic - удалить всю музыку";
  bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
  console.log("Команда /admin выполнена");
});

// Команда /delphoto (только для создателя)
bot.onText(/\/delphoto/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId !== CREATOR_ID) {
    bot.sendMessage(chatId, "доступ только для создателя!");
    return;
  }

  db.run("DELETE FROM photos", (err) => {
    if (err) {
      console.error("Ошибка при удалении фото:", err);
      bot.sendMessage(chatId, "Произошла ошибка при удалении фото.");
    } else {
      bot.sendMessage(chatId, "Все фото удалены.");
    }
  });
});

// Команда /delmusic (только для создателя)
bot.onText(/\/delmusic/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId !== CREATOR_ID) {
    bot.sendMessage(chatId, "доступ только для создателя!");
    return;
  }

  db.run("DELETE FROM music", (err) => {
    if (err) {
      console.error("Ошибка при удалении музыки:", err);
      bot.sendMessage(chatId, "Произошла ошибка при удалении музыки.");
    } else {
      bot.sendMessage(chatId, "Вся музыка удалена.");
    }
  });
});

// Команда /addphoto (только для создателя)
bot.onText(/\/addphoto/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId !== CREATOR_ID) {
    bot.sendMessage(chatId, "доступ только для создателя!");
    return;
  }

  bot.sendMessage(
    chatId,
    "Отправляй фото, я их сохраню. Когда закончишь, напиши /stop."
  );
  userStates[chatId] = { step: "adding_photo" };
});

// Команда /addmusic (только для создателя)
bot.onText(/\/addmusic/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId !== CREATOR_ID) {
    bot.sendMessage(chatId, "доступ только для создателя!");
    return;
  }

  bot.sendMessage(
    chatId,
    "Отправляй музыку, я её сохраню. Когда закончишь, напиши /stop."
  );
  userStates[chatId] = { step: "adding_music" };
});

// Обработка фото
bot.on("photo", (msg) => {
  const chatId = msg.chat.id;
  if (userStates[chatId] && userStates[chatId].step === "adding_photo") {
    const fileId = msg.photo[msg.photo.length - 1].file_id; // Берём самое большое фото
    db.run("INSERT INTO photos (file_id) VALUES (?)", [fileId], (err) => {
      if (err) {
        console.error("Ошибка при сохранении фото:", err);
        bot.sendMessage(chatId, "Произошла ошибка при сохранении фото.");
      } else {
        bot.sendMessage(
          chatId,
          "Фото сохранено! Можешь отправить ещё или напиши /stop."
        );
      }
    });
  }
});

// Обработка музыки
bot.on("audio", (msg) => {
  const chatId = msg.chat.id;
  if (userStates[chatId] && userStates[chatId].step === "adding_music") {
    const fileId = msg.audio.file_id;
    db.run("INSERT INTO music (file_id) VALUES (?)", [fileId], (err) => {
      if (err) {
        console.error("Ошибка при сохранении музыки:", err);
        bot.sendMessage(chatId, "Произошла ошибка при сохранении музыки.");
      } else {
        bot.sendMessage(
          chatId,
          "Музыка сохранена! Можешь отправить ещё или напиши /stop."
        );
      }
    });
  }
});

// Команда /stop
bot.onText(/\/stop/, (msg) => {
  const chatId = msg.chat.id;
  if (userStates[chatId] && userStates[chatId].step === "adding_photo") {
    delete userStates[chatId];
    bot.sendMessage(chatId, "Добавление фото завершено.");
  } else if (userStates[chatId] && userStates[chatId].step === "adding_music") {
    delete userStates[chatId];
    bot.sendMessage(chatId, "Добавление музыки завершено.");
  }
});

// Команда /photo
bot.onText(/\/photo/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Проверка кулдауна (1.5 секунды), кроме создателя
  if (userId !== CREATOR_ID) {
    const currentTime = Date.now();
    if (
      lastRequestTime[userId] &&
      currentTime - lastRequestTime[userId] < 1500
    ) {
      bot.sendMessage(chatId, "Подождите немного прежде чем это сделать!");
      return;
    }
    lastRequestTime[userId] = currentTime;
  }

  // Получаем случайное фото из базы данных
  db.get("SELECT file_id FROM photos ORDER BY RANDOM() LIMIT 1", (err, row) => {
    if (err) {
      console.error("Ошибка при получении фото:", err);
      bot.sendMessage(chatId, "Произошла ошибка при получении фото.");
    } else if (row) {
      bot.sendPhoto(chatId, row.file_id);
    } else {
      bot.sendMessage(
        chatId,
        "Нет сохранённых фото. Используй /addphoto, чтобы добавить фото."
      );
    }
  });
});

// Команда /music
bot.onText(/\/music/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Проверка кулдауна (1.5 секунды), кроме создателя
  if (userId !== CREATOR_ID) {
    const currentTime = Date.now();
    if (
      lastRequestTime[userId] &&
      currentTime - lastRequestTime[userId] < 1500
    ) {
      bot.sendMessage(chatId, "Подождите немного прежде чем это сделать!");
      return;
    }
    lastRequestTime[userId] = currentTime;
  }

  // Получаем случайную музыку из базы данных
  db.get("SELECT file_id FROM music ORDER BY RANDOM() LIMIT 1", (err, row) => {
    if (err) {
      console.error("Ошибка при получении музыки:", err);
      bot.sendMessage(chatId, "Произошла ошибка при получении музыки.");
    } else if (row) {
      bot.sendAudio(chatId, row.file_id);
    } else {
      bot.sendMessage(
        chatId,
        "Нет сохранённой музыки. Используй /addmusic, чтобы добавить музыку."
      );
    }
  });
});

// Обработка ошибок
bot.on("polling_error", (error) => {
  console.error(`Ошибка: ${error}`);
});

// Добавляем setInterval для поддержания активности
const keepAlive = () => {
         setInterval(() => {
             http.get(`https://${process.env.PROJECT_DOMAIN}.glitch.me`, (res) => {
                 console.log("Проект не спит!");
             }).on('error', (err) => {
                 console.error("Ошибка при запросе:", err);
             });
         }, 1 * 60 * 1000); // Каждые 4 минуты
     };

     keepAlive();