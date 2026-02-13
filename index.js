const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionsBitField,
  SlashCommandBuilder,
  Routes,
  REST
} = require("discord.js");

// ====== CONFIGURE AQUI ======
const TOKEN = "SEU_TOKEN_AQUI";
const CLIENT_ID = "SEU_CLIENT_ID_AQUI";

const GUILD_1 = "ID_DO_SERVIDOR_1";
const GUILD_2 = "ID_DO_SERVIDOR_2";
// =============================

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const valores = [100, 50, 20, 10, 5, 2, 1];

let filas = {};
let mensagens = {};
let modoServidor = {};

// ===== REGISTRAR SLASH NOS 2 SERVIDORES =====
const commands = [
  new SlashCommandBuilder()
    .setName("criarpainel")
    .setDescription("Criar painel de filas (Admin)")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_1),
    { body: commands }
  );
  console.log("✅ Registrado no servidor 1");

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_2),
    { body: commands }
  );
  console.log("✅ Registrado no servidor 2");
})();

client.once("ready", () => {
  console.log(`🔥 Bot online como ${client.user.tag}`);
});

// ===== ATUALIZAR EMBED =====
async function atualizarEmbed(idBase, guildId) {

  const msg = mensagens[idBase];
  if (!msg) return;

  const infinito = filas[`${idBase}_infinito`] || [];
  const normal = filas[`${idBase}_normal`] || [];

  const listaInf = infinito.length
    ? infinito.map(id => `<@${id}> — GEL INFINITO`).join("\n")
    : "Nenhum jogador";

  const listaNor = normal.length
    ? normal.map(id => `<@${id}> — GEL NORMAL`).join("\n")
    : "Nenhum jogador";

  const valor = idBase.split("_")[0];

  const embed = new EmbedBuilder()
    .setColor("Blue")
    .setTitle(`🎮 Fila R$${valor}`)
    .setDescription(
      `Modo: ${modoServidor[guildId]}\n\n` +
      `🟢 GEL INFINITO (${infinito.length}/2)\n${listaInf}\n\n` +
      `🔵 GEL NORMAL (${normal.length}/2)\n${listaNor}`
    );

  await msg.edit({ embeds: [embed] });
}

// ===== INTERAÇÕES =====
client.on("interactionCreate", async interaction => {

  // SLASH
  if (interaction.isChatInputCommand()) {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: "❌ Apenas Admin.", ephemeral: true });

    const menu = new StringSelectMenuBuilder()
      .setCustomId("modo_select")
      .setPlaceholder("Escolha o modo")
      .addOptions([
        { label: "1v1", value: "1v1" },
        { label: "2v2", value: "2v2" },
        { label: "3v3", value: "3v3" },
        { label: "4v4", value: "4v4" }
      ]);

    const row = new ActionRowBuilder().addComponents(menu);

    return interaction.reply({
      content: "Selecione o modo:",
      components: [row],
      ephemeral: true
    });
  }

  // SELECT MODO
  if (interaction.isStringSelectMenu()) {

    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guild.id;
    modoServidor[guildId] = interaction.values[0];

    await interaction.editReply(`✅ Criando filas ${modoServidor[guildId]}...`);

    for (const valor of valores) {

      const idBase = `${valor}_${Date.now()}`;

      filas[`${idBase}_infinito`] = [];
      filas[`${idBase}_normal`] = [];

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setTitle(`🎮 Fila R$${valor}`)
        .setDescription(
          `Modo: ${modoServidor[guildId]}\n\n` +
          `🟢 GEL INFINITO (0/2)\nNenhum jogador\n\n` +
          `🔵 GEL NORMAL (0/2)\nNenhum jogador`
        );

      const botoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`inf_${idBase}`)
          .setLabel("GEL INFINITO")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`nor_${idBase}`)
          .setLabel("GEL NORMAL")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId(`sair_${idBase}`)
          .setLabel("SAIR")
          .setStyle(ButtonStyle.Danger)
      );

      const msg = await interaction.channel.send({
        embeds: [embed],
        components: [botoes]
      });

      mensagens[idBase] = msg;

      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // BOTÕES
  if (interaction.isButton()) {

    const [tipo, idBase] = interaction.customId.split("_");

    if (tipo === "sair") {

      filas[`${idBase}_infinito`] =
        (filas[`${idBase}_infinito`] || []).filter(id => id !== interaction.user.id);

      filas[`${idBase}_normal`] =
        (filas[`${idBase}_normal`] || []).filter(id => id !== interaction.user.id);

      await interaction.reply({ content: "Saiu da fila.", ephemeral: true });

      return atualizarEmbed(idBase, interaction.guild.id);
    }

    if (tipo === "inf" || tipo === "nor") {

      const modoFila = tipo === "inf" ? "infinito" : "normal";
      const fila = filas[`${idBase}_${modoFila}`];

      if (fila.includes(interaction.user.id))
        return interaction.reply({ content: "Você já está na fila.", ephemeral: true });

      if (fila.length >= 2)
        return interaction.reply({ content: "Fila cheia.", ephemeral: true });

      fila.push(interaction.user.id);

      await interaction.reply({
        content: `Entrou no GEL ${modoFila.toUpperCase()}!`,
        ephemeral: true
      });

      atualizarEmbed(idBase, interaction.guild.id);

      if (fila.length === 2) {

        const canal = await interaction.guild.channels.create({
          name: `partida-${modoFila}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: fila[0], allow: [PermissionsBitField.Flags.ViewChannel] },
            { id: fila[1], allow: [PermissionsBitField.Flags.ViewChannel] }
          ]
        });

        await canal.send(
          `🔥 Partida iniciada!\n<@${fila[0]}> vs <@${fila[1]}>`
        );

        filas[`${idBase}_${modoFila}`] = [];
        atualizarEmbed(idBase, interaction.guild.id);
      }
    }
  }
});

client.login(TOKEN);
