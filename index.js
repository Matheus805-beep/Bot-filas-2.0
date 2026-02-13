require("dotenv").config();

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
  Routes,
  REST
} = require("discord.js");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// Fila única
let fila = [];
let modoFila = "NENHUM";

// ================= COMANDO =================
const commands = [
  new SlashCommandBuilder()
    .setName("criarfila")
    .setDescription("Cria uma fila simples (Apenas Admin)")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
})();

client.once("ready", () => {
  console.log(`🔥 Bot Online como ${client.user.tag}`);
});

// ================= FUNÇÃO ATUALIZAR EMBED =================
async function atualizarEmbed(msg) {
  const jogadores = fila.length ? fila.map(id => `<@${id}>`).join("\n") : "Nenhum jogador na fila";
  const embed = new EmbedBuilder()
    .setColor("Blue")
    .setTitle("🎮 Fila Atual")
    .setDescription(`Modo: ${modoFila}\n👥 Jogadores (${fila.length}/2):\n${jogadores}`);
  await msg.edit({ embeds: [embed] });
}

// ================= INTERAÇÕES =================
client.on("interactionCreate", async interaction => {

  // ===== SLASH =====
  if (interaction.isChatInputCommand() && interaction.commandName === "criarfila") {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "❌ Apenas admins podem criar a fila.", ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle("🎮 Fila")
      .setDescription("Modo: NENHUM\n👥 Jogadores (0/2):\nNenhum jogador na fila");

    const botoes = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("entrar_infinito")
        .setLabel("GEL INFINITO")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("entrar_normal")
        .setLabel("GEL NORMAL")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("sair")
        .setLabel("SAIR")
        .setStyle(ButtonStyle.Danger)
    );

    const msg = await interaction.reply({ embeds: [embed], components: [botoes], fetchReply: true });
  }

  // ===== BOTÕES =====
  if (interaction.isButton()) {

    // Entrar na fila
    if (interaction.customId === "entrar_infinito" || interaction.customId === "entrar_normal") {

      if (fila.includes(interaction.user.id)) {
        return interaction.reply({ content: "Você já está na fila.", ephemeral: true });
      }

      if (fila.length >= 2) {
        return interaction.reply({ content: "Fila cheia.", ephemeral: true });
      }

      fila.push(interaction.user.id);
      modoFila = interaction.customId === "entrar_infinito" ? "GEL INFINITO" : "GEL NORMAL";
      await interaction.reply({ content: `Você entrou na fila (${modoFila})!`, ephemeral: true });

      // Atualiza embed
      await atualizarEmbed(interaction.message);

      // Quando 2 players entram → cria canal privado
      if (fila.length === 2) {
        const guild = interaction.guild;
        const canal = await guild.channels.create({
          name: `partida-${Date.now()}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: fila[0], allow: [PermissionsBitField.Flags.ViewChannel] },
            { id: fila[1], allow: [PermissionsBitField.Flags.ViewChannel] }
          ]
        });

        const finalizarBtn = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`finalizar_partida_${fila[0]}_${fila[1]}`)
            .setLabel("Finalizar Partida")
            .setStyle(ButtonStyle.Danger)
        );

        await canal.send({
          content: `🔥 Partida iniciada!\nModo: ${modoFila}\n<@${fila[0]}> vs <@${fila[1]}>`,
          components: [finalizarBtn]
        });

        // Reset fila
        fila = [];
        modoFila = "NENHUM";
        await atualizarEmbed(interaction.message);
      }
    }

    // Sair da fila
    if (interaction.customId === "sair") {
      fila = fila.filter(id => id !== interaction.user.id);
      await interaction.reply({ content: "Você saiu da fila.", ephemeral: true });
      await atualizarEmbed(interaction.message);
    }

    // Finalizar partida
    if (interaction.customId.startsWith("finalizar_partida")) {
      const [_, player1, player2] = interaction.customId.split("_");
      if (![player1, player2].includes(interaction.user.id)) {
        return interaction.reply({ content: "❌ Apenas jogadores podem finalizar.", ephemeral: true });
      }

      await interaction.reply("✅ Partida finalizada! Canal será apagado em 5 segundos.");
      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, 5000);
    }
  }

});

client.login(TOKEN);
