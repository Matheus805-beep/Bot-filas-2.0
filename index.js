require("dotenv").config();

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

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const valores = [100, 50, 20, 10, 5, 2, 1];
let filas = {};
let mensagensFilas = {};
let modosFilas = {};

// Delay
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ================= COMANDO =================
const commands = [
  new SlashCommandBuilder()
    .setName("criarpainel")
    .setDescription("Criar painel de filas (Admin)")
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

// ================= ATUALIZAR EMBED =================
async function atualizarEmbed(filaId) {
  const fila = filas[filaId];
  const msg = mensagensFilas[filaId];
  const modo = modosFilas[filaId];

  if (!msg) return;

  const jogadores = fila.length
    ? fila.map(id => `<@${id}>`).join("\n")
    : "Nenhum jogador na fila";

  const embed = new EmbedBuilder()
    .setColor("Blue")
    .setTitle(msg.embeds[0].data.title)
    .setDescription(
      `💰 Valor: ${filaId.split("_")[1]}\n` +
      `Modo: ${modo}\n` +
      `👥 Jogadores (${fila.length}/2):\n${jogadores}`
    );

  await msg.edit({ embeds: [embed] });
}

// ================= INTERAÇÕES =================
client.on("interactionCreate", async interaction => {

  // ===== SLASH =====
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "criarpainel") {

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: "❌ Apenas admins.", ephemeral: true });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId("select_modo")
        .setPlaceholder("Escolha o modo")
        .addOptions([
          { label: "1v1", value: "1v1" },
          { label: "2v2", value: "2v2" },
          { label: "3v3", value: "3v3" },
          { label: "4v4", value: "4v4" }
        ]);

      const row = new ActionRowBuilder().addComponents(menu);

      return interaction.reply({
        content: "Selecione o modo das filas:",
        components: [row],
        ephemeral: true
      });
    }
  }

  // ===== SELECT MENU =====
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "select_modo") {

      const modoEscolhido = interaction.values[0];

      // RESPONDE IMEDIATAMENTE (corrige interação falhou)
      await interaction.deferReply({ ephemeral: true });

      await interaction.editReply(`✅ Criando filas no modo **${modoEscolhido}**...`);

      for (const valor of valores) {

        const filaId = `fila_${valor}_${Date.now()}`;

        filas[filaId] = [];
        modosFilas[filaId] = modoEscolhido;

        const embed = new EmbedBuilder()
          .setColor("Blue")
          .setTitle(`🎮 Fila R$${valor}`)
          .setDescription(
            `💰 Valor: ${valor}\n` +
            `Modo: ${modoEscolhido}\n` +
            `👥 Jogadores (0/2):\nNenhum jogador na fila`
          );

        const botoes = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`entrar_infinito_${filaId}`)
            .setLabel("GEL INFINITO")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId(`entrar_normal_${filaId}`)
            .setLabel("GEL NORMAL")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId(`sair_x_${filaId}`)
            .setLabel("SAIR")
            .setStyle(ButtonStyle.Danger)
        );

        const mensagem = await interaction.channel.send({
          embeds: [embed],
          components: [botoes]
        });

        mensagensFilas[filaId] = mensagem;

        await sleep(2000); // delay entre filas
      }
    }
  }

  // ===== BOTÕES =====
  if (interaction.isButton()) {

    const parts = interaction.customId.split("_");

    // SAIR
    if (parts[0] === "sair") {
      const filaId = parts.slice(2).join("_");
      const fila = filas[filaId];
      if (!fila) return;

      filas[filaId] = fila.filter(id => id !== interaction.user.id);

      await interaction.reply({ content: "Você saiu da fila.", ephemeral: true });
      return atualizarEmbed(filaId);
    }

    // ENTRAR
    if (parts[0] === "entrar") {

      const modoBotao = parts[1];
      const filaId = parts.slice(2).join("_");

      const fila = filas[filaId];
      if (!fila) return;

      if (fila.includes(interaction.user.id))
        return interaction.reply({ content: "Você já está na fila.", ephemeral: true });

      if (fila.length >= 2)
        return interaction.reply({ content: "Fila cheia.", ephemeral: true });

      fila.push(interaction.user.id);

      await interaction.reply({
        content: `Você entrou (${modoBotao.toUpperCase()})!`,
        ephemeral: true
      });

      atualizarEmbed(filaId);

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
            .setCustomId(`finalizar_${fila[0]}_${fila[1]}`)
            .setLabel("Finalizar Partida")
            .setStyle(ButtonStyle.Danger)
        );

        await canal.send({
          content: `🔥 Partida iniciada!\nModo: ${modoBotao.toUpperCase()}\n<@${fila[0]}> vs <@${fila[1]}>`,
          components: [finalizarBtn]
        });

        filas[filaId] = [];
        atualizarEmbed(filaId);
      }
    }

    // FINALIZAR
    if (interaction.customId.startsWith("finalizar_")) {

      const [, player1, player2] = interaction.customId.split("_");

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
