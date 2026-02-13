require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  REST,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require("discord.js");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN) {
  console.error("TOKEN não definido.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers
  ]
});

const ranking = {};
const historico = [];
const LOG_CHANNEL_NAME = "📜-logs-apostado";

// ========================
// REGISTRAR SLASH COMMANDS
// ========================

const commands = [
  new SlashCommandBuilder()
    .setName("partida")
    .setDescription("Criar partida apostada")
    .addStringOption(option =>
      option.setName("modo")
        .setDescription("1v1, 2v2, 3v3 ou 4v4")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("valor")
        .setDescription("Valor da aposta")
        .setRequired(true)
    )
    .addUserOption(option =>
      option.setName("jogador1")
        .setDescription("Primeiro jogador")
        .setRequired(true)
    )
    .addUserOption(option =>
      option.setName("jogador2")
        .setDescription("Segundo jogador")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Ver ranking da organização")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("Slash commands registrados.");
  } catch (err) {
    console.error(err);
  }
})();

// ========================
// CRIAR CANAL DE LOG
// ========================

async function getLogChannel(guild) {
  let canal = guild.channels.cache.find(c => c.name === LOG_CHANNEL_NAME);

  if (!canal) {
    canal = await guild.channels.create({
      name: LOG_CHANNEL_NAME,
      type: ChannelType.GuildText
    });
  }

  return canal;
}

// ========================
// BOT ONLINE
// ========================

client.once("ready", () => {
  console.log(`Bot online como ${client.user.tag}`);
});

// ========================
// INTERAÇÕES
// ========================

client.on("interactionCreate", async interaction => {

  if (interaction.isChatInputCommand()) {

    // ===== CRIAR PARTIDA =====
    if (interaction.commandName === "partida") {

      const modo = interaction.options.getString("modo");
      const valor = interaction.options.getInteger("valor");
      const jogador1 = interaction.options.getUser("jogador1");
      const jogador2 = interaction.options.getUser("jogador2");

      historico.push({
        modo,
        valor,
        jogadores: [jogador1.id, jogador2.id]
      });

      const embed = new EmbedBuilder()
        .setColor("Green")
        .setTitle("🔥 PARTIDA CRIADA")
        .addFields(
          { name: "Modo", value: modo, inline: true },
          { name: "Valor", value: `R$ ${valor}`, inline: true },
          { name: "Jogadores", value: `${jogador1} vs ${jogador2}` }
        )
        .setFooter({ text: "Aguardando confirmação PIX" });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirmar_${valor}`)
          .setLabel("Confirmar Pagamento")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`cancelar_${valor}`)
          .setLabel("Cancelar")
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({
        embeds: [embed],
        components: [row]
      });
    }

    // ===== RANKING =====
    if (interaction.commandName === "ranking") {

      if (Object.keys(ranking).length === 0) {
        return interaction.reply("Ranking vazio.");
      }

      let texto = "🏆 Ranking Atual:\n\n";

      const ordenado = Object.entries(ranking)
        .sort((a, b) => b[1].vitorias - a[1].vitorias);

      ordenado.forEach(([id, stats], index) => {
        texto += `${index + 1}. <@${id}> - ${stats.vitorias}V | ${stats.derrotas}D\n`;
      });

      interaction.reply(texto);
    }
  }

  // ===== BOTÕES =====
  if (interaction.isButton()) {

    const ultimaPartida = historico[historico.length - 1];
    if (!ultimaPartida) return;

    const valor = ultimaPartida.valor;
    const [j1, j2] = ultimaPartida.jogadores;

    if (interaction.customId.startsWith("confirmar")) {

      const vencedor = j1;
      const perdedor = j2;

      if (!ranking[vencedor]) ranking[vencedor] = { vitorias: 0, derrotas: 0 };
      if (!ranking[perdedor]) ranking[perdedor] = { vitorias: 0, derrotas: 0 };

      ranking[vencedor].vitorias++;
      ranking[perdedor].derrotas++;

      const logChannel = await getLogChannel(interaction.guild);

      await logChannel.send(
        `📜 PARTIDA CONFIRMADA\n💰 R$ ${valor}\n🏆 Vencedor: <@${vencedor}>\n❌ Perdedor: <@${perdedor}>`
      );

      await interaction.update({
        content: "✅ Pagamento confirmado e ranking atualizado.",
        embeds: [],
        components: []
      });
    }

    if (interaction.customId.startsWith("cancelar")) {
      await interaction.update({
        content: "❌ Partida cancelada.",
        embeds: [],
        components: []
      });
    }
  }
});

// ========================
// LOGIN
// ========================

client.login(TOKEN);
