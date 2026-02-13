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
  StringSelectMenuBuilder,
  ChannelType,
  PermissionsBitField
} = require("discord.js");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// 🔥 FILAS ORDEM DECRESCENTE
const valores = [100, 50, 20, 10, 5, 2, 1];

let filas = {};
let mensagensFilas = {};

// ================= COMANDO =================

const commands = [
  new SlashCommandBuilder()
    .setName("criarpainel")
    .setDescription("Criar painel de filas (Apenas Admin)")
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

async function atualizarEmbed(filaId) {
  const fila = filas[filaId];
  const msg = mensagensFilas[filaId];
  if (!msg) return;

  const jogadores = fila.length
    ? fila.map(id => `<@${id}>`).join("\n")
    : "Nenhum jogador na fila";

  const embed = new EmbedBuilder()
    .setColor("Blue")
    .setTitle(msg.embeds[0].data.title)
    .setDescription(
      msg.embeds[0].data.description.split("\n")[0] +
      `\n👥 Jogadores (${fila.length}/2):\n${jogadores}`
    );

  await msg.edit({ embeds: [embed] });
}

// ================= INTERAÇÕES =================

client.on("interactionCreate", async interaction => {

  // ===== SLASH =====
  if (interaction.isChatInputCommand() && interaction.commandName === "criarpainel") {

    // 🔒 Apenas ADMIN
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: "❌ Apenas administradores podem criar o painel.",
        ephemeral: true
      });
    }

    // Menu para escolher tipo
    const menu = new StringSelectMenuBuilder()
      .setCustomId("selecionar_tipo")
      .setPlaceholder("Escolha o tipo")
      .addOptions([
        { label: "1v1", value: "1v1" },
        { label: "2v2", value: "2v2" },
        { label: "3v3", value: "3v3" },
        { label: "4v4", value: "4v4" }
      ]);

    const row = new ActionRowBuilder().addComponents(menu);

    // ✅ Resposta imediata
    await interaction.reply({
      content: "🎮 Escolha o tipo:",
      components: [row],
      ephemeral: true
    });
  }

  // ===== MENU =====
  if (interaction.isStringSelectMenu() && interaction.customId === "selecionar_tipo") {

    const tipo = interaction.values[0];

    // ✅ Responde imediatamente
    await interaction.reply({
      content: `✅ Painel ${tipo} está sendo criado em background...`,
      ephemeral: true
    });

    // Criar filas em background usando setTimeout para não travar interação
    setTimeout(async () => {
      for (const valor of valores) {

        const filaId = `${tipo}_${valor}_${Date.now()}`;
        filas[filaId] = [];

        const embed = new EmbedBuilder()
          .setColor("Blue")
          .setTitle(`🎮 ${tipo}`)
          .setDescription(
            `💰 Valor: R$${valor}\n👥 Jogadores (0/2):\nNenhum jogador na fila`
          );

        const botoes = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`entrar_${filaId}`)
            .setLabel("Entrar")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId(`sair_${filaId}`)
            .setLabel("Sair")
            .setStyle(ButtonStyle.Danger)
        );

        const mensagem = await interaction.channel.send({
          embeds: [embed],
          components: [botoes]
        });

        mensagensFilas[filaId] = mensagem;
      }
    }, 100); // pequeno delay para liberar interação
  }

  // ===== BOTÕES =====
  if (interaction.isButton()) {

    const [acao, filaId] = interaction.customId.split("_");
    const fila = filas[filaId];
    if (!fila) return;

    if (acao === "sair") {
      filas[filaId] = fila.filter(id => id !== interaction.user.id);
      await interaction.reply({ content: "Você saiu da fila.", ephemeral: true });
      return atualizarEmbed(filaId);
    }

    if (acao === "entrar") {

      if (fila.includes(interaction.user.id))
        return interaction.reply({ content: "Você já está na fila.", ephemeral: true });

      if (fila.length >= 2)
        return interaction.reply({ content: "Fila cheia.", ephemeral: true });

      fila.push(interaction.user.id);

      await interaction.reply({ content: "Entrou na fila!", ephemeral: true });
      atualizarEmbed(filaId);

      // ✅ Quando 2 players entram
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
            .setCustomId("finalizar_partida")
            .setLabel("Finalizar Partida")
            .setStyle(ButtonStyle.Danger)
        );

        await canal.send({
          content: `🔥 Partida iniciada!\n<@${fila[0]}> vs <@${fila[1]}>`,
          components: [finalizarBtn]
        });

        filas[filaId] = [];
        atualizarEmbed(filaId);
      }
    }
  }

  // ===== FINALIZAR =====
  if (interaction.isButton() && interaction.customId === "finalizar_partida") {

    await interaction.reply("✅ Partida finalizada! Canal será apagado em 5 segundos.");

    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 5000);
  }

});

client.login(TOKEN);
