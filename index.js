require("dotenv").config();
const fs = require("fs-extra");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ================= CONFIG =================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const ORG_NAME = "SUA ORG";
const LOG_CHANNEL_NAME = "📋-logs-apostas";
const CHAVE_PIX = "SUA_CHAVE_PIX_AQUI";
const COMISSAO = 0.10; // 10%

const VALORES = [1, 2, 5, 10, 20, 50, 100];
const MODOS = ["1v1", "2v2", "3v3", "4v4"];

const DB_FILE = "./database.json";

let db = {
  ranking: {},
  saldo: {},
  historico: []
};

if (fs.existsSync(DB_FILE)) {
  db = fs.readJsonSync(DB_FILE);
}

function salvarDB() {
  fs.writeJsonSync(DB_FILE, db, { spaces: 2 });
}

const filas = {};

// ================= REGISTRAR SLASH =================

const commands = [
  new SlashCommandBuilder()
    .setName("filas")
    .setDescription("Criar todas as filas"),

  new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Ver ranking oficial"),

  new SlashCommandBuilder()
    .setName("saldo")
    .setDescription("Ver seu saldo"),

  new SlashCommandBuilder()
    .setName("finalizar")
    .setDescription("Finalizar partida (STAFF)")
    .addUserOption(opt =>
      opt.setName("vencedor")
        .setDescription("Jogador vencedor")
        .setRequired(true)
    )
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
})();

// ================= EMBED FILA =================

function embedFila(modo, valor) {
  const jogadores = filas[modo][valor];

  return new EmbedBuilder()
    .setColor("#00c2ff")
    .setAuthor({ name: `${ORG_NAME} • FILAS PREMIUM` })
    .addFields(
      { name: "🎮 Modo", value: modo, inline: true },
      { name: "💰 Valor", value: `R$ ${valor}`, inline: true },
      {
        name: `👥 Jogadores (${jogadores.length}/2)`,
        value: jogadores.length
          ? jogadores.map(j => `• <@${j}>`).join("\n")
          : "Aguardando jogadores..."
      }
    )
    .setFooter({ text: "Sistema Oficial" })
    .setTimestamp();
}

// ================= EVENTOS =================

client.on("interactionCreate", async interaction => {

  // ================= /FILAS =================
  if (interaction.isChatInputCommand() &&
      interaction.commandName === "filas") {

    await interaction.reply({
      content: "🚀 Criando filas...",
      ephemeral: true
    });

    for (let modo of MODOS) {
      filas[modo] = {};

      for (let valor of VALORES) {
        filas[modo][valor] = [];

        await interaction.channel.send({
          embeds: [embedFila(modo, valor)],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`entrar_${modo}_${valor}`)
                .setLabel("Entrar")
                .setStyle(ButtonStyle.Success),

              new ButtonBuilder()
                .setCustomId(`sair_${modo}_${valor}`)
                .setLabel("Sair")
                .setStyle(ButtonStyle.Danger)
            )
          ]
        });
      }
    }
  }

  // ================= BOTÕES =================
  if (interaction.isButton()) {

    const [acao, modo, valor] =
      interaction.customId.split("_");

    const userId = interaction.user.id;

    if (!filas[modo] || !filas[modo][valor]) return;

    if (acao === "entrar") {
      if (!filas[modo][valor].includes(userId))
        filas[modo][valor].push(userId);
    }

    if (acao === "sair") {
      filas[modo][valor] =
        filas[modo][valor].filter(id => id !== userId);
    }

    await interaction.update({
      embeds: [embedFila(modo, valor)],
      components: interaction.message.components
    });

    // FECHAR COM 2 JOGADORES
    if (filas[modo][valor].length === 2) {

      const jogadores = filas[modo][valor];

      const canal =
        await interaction.guild.channels.create({
          name: `💰-${modo}-${valor}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [PermissionsBitField.Flags.ViewChannel]
            },
            ...jogadores.map(id => ({
              id,
              allow: [PermissionsBitField.Flags.ViewChannel]
            }))
          ]
        });

      canal.send(
        `🔥 PARTIDA INICIADA\n\n` +
        `💰 Valor: R$ ${valor}\n\n` +
        `💳 Enviar PIX para:\n\`\`\`${CHAVE_PIX}\`\`\`\n\n` +
        `Após pagamento, aguarde a staff finalizar.`
      );

      db.historico.push({
        modo,
        valor,
        jogadores,
        canal: canal.id,
        data: new Date().toLocaleString("pt-BR")
      });

      salvarDB();

      filas[modo][valor] = [];
    }
  }

  // ================= /FINALIZAR =================
  if (interaction.isChatInputCommand() &&
      interaction.commandName === "finalizar") {

    if (!interaction.member.permissions
        .has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({
        content: "❌ Apenas staff pode finalizar.",
        ephemeral: true
      });

    const vencedor =
      interaction.options.getUser("vencedor");

    const ultima =
      db.historico[db.historico.length - 1];

    if (!ultima)
      return interaction.reply("Nenhuma partida encontrada.");

    const valor = ultima.valor;
    const premio = valor * 2;
    const taxa = premio * COMISSAO;
    const liquido = premio - taxa;

    db.ranking[vencedor.id] =
      (db.ranking[vencedor.id] || 0) + 1;

    db.saldo[vencedor.id] =
      (db.saldo[vencedor.id] || 0) + liquido;

    salvarDB();

    let log =
      interaction.guild.channels.cache
        .find(c => c.name === LOG_CHANNEL_NAME);

    if (!log) {
      log = await interaction.guild.channels.create({
        name: LOG_CHANNEL_NAME,
        type: ChannelType.GuildText
      });
    }

    log.send(
      `🏁 Partida Finalizada\n` +
      `👑 Vencedor: <@${vencedor.id}>\n` +
      `💰 Valor: R$ ${valor}\n` +
      `💸 Comissão ORG: R$ ${taxa.toFixed(2)}`
    );

    interaction.reply(
      `🏆 Vitória registrada!\n` +
      `💵 Saldo ganho: R$ ${liquido.toFixed(2)}`
    );
  }

  // ================= /RANKING =================
  if (interaction.isChatInputCommand() &&
      interaction.commandName === "ranking") {

    const top = Object.entries(db.ranking)
      .sort((a,b)=> b[1]-a[1])
      .slice(0,10);

    if (!top.length)
      return interaction.reply("Ranking vazio.");

    const embed = new EmbedBuilder()
      .setColor("#ffd700")
      .setTitle("🏆 Ranking Oficial")
      .setDescription(
        top.map((p,i)=>
          `#${i+1} <@${p[0]}> — ${p[1]} vitórias`
        ).join("\n")
      );

    interaction.reply({ embeds: [embed] });
  }

  // ================= /SALDO =================
  if (interaction.isChatInputCommand() &&
      interaction.commandName === "saldo") {

    const saldo =
      db.saldo[interaction.user.id] || 0;

    interaction.reply({
      content: `💰 Seu saldo: R$ ${saldo.toFixed(2)}`,
      ephemeral: true
    });
  }

});

client.login(TOKEN);
