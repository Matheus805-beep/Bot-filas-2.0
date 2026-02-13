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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

let fila = [];
let configFila = {
  tipo: "1v1",
  valor: 2
};

// ======================
// REGISTRAR COMANDOS
// ======================

const commands = [

  new SlashCommandBuilder()
    .setName("fila")
    .setDescription("Sistema de fila")
    .addSubcommand(sub =>
      sub.setName("configurar")
        .setDescription("Configurar tipo e valor")
        .addStringOption(option =>
          option.setName("tipo")
            .setDescription("1v1, 2v2, 3v3, 4v4")
            .setRequired(true)
            .addChoices(
              { name: "1v1", value: "1v1" },
              { name: "2v2", value: "2v2" },
              { name: "3v3", value: "3v3" },
              { name: "4v4", value: "4v4" }
            ))
        .addNumberOption(option =>
          option.setName("valor")
            .setDescription("Valor da aposta")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("abrir")
        .setDescription("Abrir painel da fila")
    )

].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
})();

// ======================
// READY
// ======================

client.once("ready", () => {
  console.log(`🔥 Bot online como ${client.user.tag}`);
});

// ======================
// INTERAÇÕES
// ======================

client.on("interactionCreate", async interaction => {

  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  // ===== SLASH =====
  if (interaction.isChatInputCommand()) {

    const sub = interaction.options.getSubcommand();

    // CONFIGURAR
    if (sub === "configurar") {

      configFila.tipo = interaction.options.getString("tipo");
      configFila.valor = interaction.options.getNumber("valor");
      fila = [];

      return interaction.reply(
        `✅ Configurado: ${configFila.tipo} | R$ ${configFila.valor}\n⚠ Sempre fecha com 2 jogadores.`
      );
    }

    // ABRIR
    if (sub === "abrir") {

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setTitle(`🎮 FILA ${configFila.tipo}`)
        .setDescription(
          `💰 Valor: R$ ${configFila.valor}\n\n` +
          `👥 Jogadores necessários: 2`
        )
        .setFooter({ text: `Na fila: ${fila.length}/2` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("entrar_fila")
          .setLabel("✅ Entrar")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId("sair_fila")
          .setLabel("🚪 Sair")
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({
        embeds: [embed],
        components: [row]
      });
    }
  }

  // ===== BOTÕES =====
  if (interaction.isButton()) {

    if (interaction.customId === "entrar_fila") {

      if (fila.includes(interaction.user.id)) {
        return interaction.reply({ content: "Você já está na fila.", ephemeral: true });
      }

      if (fila.length >= 2) {
        return interaction.reply({ content: "Fila já está cheia.", ephemeral: true });
      }

      fila.push(interaction.user.id);
      await interaction.reply({ content: "Você entrou na fila.", ephemeral: true });

      // SEMPRE FECHA COM 2
      if (fila.length === 2) {

        const guild = interaction.guild;

        const canal = await guild.channels.create({
          name: `partida-${configFila.tipo}-${Date.now()}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
              id: fila[0],
              allow: [PermissionsBitField.Flags.ViewChannel]
            },
            {
              id: fila[1],
              allow: [PermissionsBitField.Flags.ViewChannel]
            }
          ]
        });

        const embedPartida = new EmbedBuilder()
          .setColor("Green")
          .setTitle("🔥 PARTIDA INICIADA")
          .setDescription(
            `🎮 Tipo: ${configFila.tipo}\n` +
            `💰 Valor: R$ ${configFila.valor}\n\n` +
            `Confirme o PIX e escolha o tipo de gel.`
          );

        const rowPartida = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("pix_confirmar")
            .setLabel("💰 Confirmar PIX")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId("gel_normal")
            .setLabel("🧊 Gel Normal")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId("gel_infinito")
            .setLabel("♾️ Gel Infinito")
            .setStyle(ButtonStyle.Secondary)
        );

        await canal.send({
          content: `<@${fila[0]}> <@${fila[1]}>`,
          embeds: [embedPartida],
          components: [rowPartida]
        });

        fila = [];
      }
    }

    if (interaction.customId === "sair_fila") {
      fila = fila.filter(id => id !== interaction.user.id);
      return interaction.reply({ content: "Você saiu da fila.", ephemeral: true });
    }

    if (interaction.customId === "pix_confirmar") {
      return interaction.reply("✅ Pagamento confirmado manualmente.");
    }

    if (interaction.customId === "gel_normal") {
      return interaction.reply("🧊 Gel Normal selecionado.");
    }

    if (interaction.customId === "gel_infinito") {
      return interaction.reply("♾️ Gel Infinito selecionado.");
    }
  }
});

client.login(TOKEN);
