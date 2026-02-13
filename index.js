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

// Ordem decrescente das filas
const valores = [100, 50, 20, 10, 5, 2, 1];

let filas = {};
let mensagensFilas = {};
let modosFilas = {}; // guarda o modo de cada fila

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
  const modo = modosFilas[filaId] || "NORMAL";
  if (!msg) return;

  const jogadores = fila.length
    ? fila.map(id => `<@${id}>`).join("\n")
    : "Nenhum jogador na fila";

  const embed = new EmbedBuilder()
    .setColor("Blue")
    .setTitle(msg.embeds[0].data.title)
    .setDescription(
      msg.embeds[0].data.description.split("\n")[0] +
      `\nModo: ${modo}\n👥 Jogadores (${fila.length}/2):\n${jogadores}`
    );

  await msg.edit({ embeds: [embed] });
}

// ================= INTERAÇÕES =================

client.on("interactionCreate", async interaction => {

  // ===== SLASH =====
  if (interaction.isChatInputCommand() && interaction.commandName === "criarpainel") {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: "❌ Apenas administradores podem criar o painel.",
        ephemeral: true
      });
    }

    // Menu de tipo
    const menuTipo = new StringSelectMenuBuilder()
      .setCustomId("selecionar_tipo")
      .setPlaceholder("Escolha o tipo")
      .addOptions([
        { label: "1v1", value: "1v1" },
        { label: "2v2", value: "2v2" },
        { label: "3v3", value: "3v3" },
        { label: "4v4", value: "4v4" }
      ]);

    const rowTipo = new ActionRowBuilder().addComponents(menuTipo);

    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({
      content: "🎮 Escolha o tipo da fila:",
      components: [rowTipo]
    });
  }

  // ===== MENU TIPO =====
  if (interaction.isStringSelectMenu() && interaction.customId === "selecionar_tipo") {

    const tipo = interaction.values[0];

    // Menu de modo
    const menuModo = new StringSelectMenuBuilder()
      .setCustomId("selecionar_modo")
      .setPlaceholder("Escolha o modo")
      .addOptions([
        { label: "GEL NORMAL", value: "NORMAL" },
        { label: "GEL INFINITO", value: "INFINITO" }
      ]);

    const rowModo = new ActionRowBuilder().addComponents(menuModo);

    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({
      content: `✅ Tipo ${tipo} selecionado! Agora escolha o modo:`,
      components: [rowModo]
    });

    // Salva temporariamente o tipo na interação
    interaction.user.tipoSelecionado = tipo;
  }

  // ===== MENU MODO =====
  if (interaction.isStringSelectMenu() && interaction.customId === "selecionar_modo") {

    const modo = interaction.values[0];
    const tipo = interaction.user.tipoSelecionado || "1v1";

    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({
      content: `✅ Painel ${tipo} criado no modo ${modo}! Filas prontas.`,
      components: []
    });

    // Criar todas as filas imediatamente
    for (const valor of valores) {
      const filaId = `${tipo}_${valor}_${Date.now()}`;
      filas[filaId] = [];
      modosFilas[filaId] = modo;

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setTitle(`🎮 ${tipo}`)
        .setDescription(`💰 Valor: R$${valor}\nModo: ${modo}\n👥 Jogadores (0/2):\nNenhum jogador na fila`);

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

      // Quando 2 players entram
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
          content: `🔥 Partida iniciada!\nModo: ${modosFilas[filaId]}\n<@${fila[0]}> vs <@${fila[1]}>`,
          components: [finalizarBtn]
        });

        filas[filaId] = [];
        atualizarEmbed(filaId);
      }
    }
  }

  // ===== FINALIZAR =====
  if (interaction.isButton() && interaction.customId.startsWith("finalizar_partida")) {

    const [_, player1, player2] = interaction.customId.split("_");

    if (![player1, player2].includes(interaction.user.id)) {
      return interaction.reply({ content: "❌ Apenas os jogadores da partida podem finalizar.", ephemeral: true });
    }

    await interaction.reply("✅ Partida finalizada! Canal será apagado em 5 segundos.");

    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 5000);
  }

});

client.login(TOKEN);
