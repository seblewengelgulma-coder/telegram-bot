const { Telegraf } = require('telegraf');

const TOKEN = process.env.BOT_TOKEN;

if (!TOKEN) {
  console.error('❌ BOT_TOKEN is not defined!');
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

const OWNER_ID = 380035906;

let subAdmins = [
  897196934,
  356872111,
  1259126904,
  7192701371,
  413158935,
  1694041775
];

module.exports = {
  bot,
  OWNER_ID,
  subAdmins
};