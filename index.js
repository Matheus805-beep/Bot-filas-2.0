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
  ChannelType,
  PermissionsBitField
} = require("discord.js");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// =====================
// CONFIG
// =====================

let config = {
  tipo: "1v1"
};

const valores = [1, 2, 5, 10, 20, 50, 100];

let filas = {};
let painelMensagem = null;
let vitorias = {};

valores.forEach(v => {
  filas[v] = [];
});

// =====================
// COMANDOS
// =====================

const commands = [

  new SlashCommandBuilder()
    .setName("configurar")
    .setDescription("Configurar tipo da partida (Admin)")
    .addStringOption(option =>
      option.setName("tipo")
        .setDescription("Tipo")
        .setRequired(true)
        .addChoices(
          { name: "1v1", value: "1v1" },
          { name: "2v2", value: "2v2" },
          { name: "3v3", value: "3v3" },
          { name: "4v4", value: "4v4" }
        )),

  new SlashCommandBuilder()
    .setName("painel")
    .setDescription("Abrir painel de filas")

].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
})();

// =====================
// ATUALIZAR PAINEL
// =====================

async function atualizarPainel() {
  if (!painelMensagem) return;

  let descricao = `🎮 Tipo atual: ${config.tipo}\n\n`;

  valores.forEach(v => {
    descricao += `💰 R$${v} → ${filas[v].length}/2\n`;
  });

  const embed = new EmbedBuilder()
    .setColor("Blue")
    .setTitle("🔥 SISTEMA DE FILAS")
    .setDescription(descricao);

  await painelMensagem.edit({ embeds: [embed] });
}

// =====================
// READY
// =====================

client.once("ready", () => {
  console.log(`🔥 Bot online como ${client.user.tag}`);
});

// =====================
// INTERAÇÕES
// =====================

client.on("interactionCreate", async interaction => {

  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  // ================= SLASH =================

  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "configurar") {

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
        return interaction.reply({ content: "❌ Apenas administradores.", ephemeral: true });

      config.tipo = interaction.options.getString("tipo");

      return interaction.reply("✅ Tipo atualizado!");
    }

    if (interaction.commandName === "painel") {

      let descricao = `🎮 Tipo atual: ${config.tipo}\n\n`;

      valores.forEach(v => {
        descricao += `💰 R$${v} → 0/2\n`;
      });

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setTitle("🔥 SISTEMA DE FILAS")
        .setDescription(descricao);

      const rows = [];

      for (let i = 0; i < valores.length; i += 5) {
        const row = new ActionRowBuilder();

        valores.slice(i, i + 5).forEach(v => {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`fila_${v}`)
              .setLabel(`R$${v}`)
              .setStyle(ButtonStyle.Success)
          );
        });

        rows.push(row);
      }

      painelMensagem = await interaction.reply({
        embeds: [embed],
        components: rows,
        fetchReply: true
      });
    }
  }

  // ================= BOTÕES =================

  if (interaction.isButton()) {

    if (interaction.customId.startsWith("fila_")) {

      const valor = interaction.customId.split("_")[1];

      const fila = filas[valor];

      if (fila.includes(interaction.user.id))
        return interaction.reply({ content: "Você já está nessa fila.", ephemeral: true });

      if (fila.length >= 2)
        return interaction.reply({ content: "Fila cheia.", ephemeral: true });

      fila.push(interaction.user.id);
      await interaction.reply({ content: `Entrou na fila R$${valor}`, ephemeral: true });

      atualizarPainel();

      if (fila.length === 2) {

        const guild = interaction.guild;

        const canal = await guild.channels.create({
          name: `partida-${valor}-${Date.now()}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: fila[0], allow: [PermissionsBitField.Flags.ViewChannel] },
            { id: fila[1], allow: [PermissionsBitField.Flags.ViewChannel] }
          ]
        });

        const embed = new EmbedBuilder()
          .setColor("Green")
          .setTitle(`🔥 PARTIDA R$${valor}`)
          .setDescription("Escolha o vencedor:");

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`win_${valor}_${fila[0]}`)
            .setLabel("Vitória Player 1")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId(`win_${valor}_${fila[1]}`)
            .setLabel("Vitória Player 2")
            .setStyle(ButtonStyle.Primary)
        );

        await canal.send({
          content: `<@${fila[0]}> <@${fila[1]}>`,
          embeds: [embed],
          components: [row]
        });

        filas[valor] = [];
        atualizarPainel();
      }
    }

    // ================= VITÓRIA =================

    if (interaction.customId.startsWith("win_")) {

      const parts = interaction.customId.split("_");
      const valor = parts[1];
      const winnerId = parts[2];

      if (!vitorias[winnerId]) vitorias[winnerId] = 0;
      vitorias[winnerId]++;

      const logChannel = client.channels.cache.get(1471694293499514991);

      if (logChannel) {
        logChannel.send(
          `🏆 Vitória: <@${winnerId}> | R$${valor} | Total vitórias: ${vitorias[winnerId]}`
        );
      }

      await interaction.reply("✅ Partida finalizada! Canal será deletado.");

      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 5000);
    }
  }
});

client.login(TOKEN);
