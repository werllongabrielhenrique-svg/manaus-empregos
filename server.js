const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.static(path.join(__dirname)));
app.use(cors());
app.use(express.json());

// Conexão com o banco de dados MySQL usando POOL (Evita que o banco desconecte sozinho no Railway)
const db = mysql.createPool({
    // Lê as variáveis nativas do Railway (MYSQLHOST) ou as suas antigas (DB_HOST)
    host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
    user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '1234', 
    database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'portal_vagas',
    port: process.env.MYSQLPORT || process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Testa a conexão do Pool e cria a tabela se não existir
db.getConnection((erro, connection) => {
    if (erro) {
        console.error('Erro ao conectar com o banco:', erro);
        return;
    }
    console.log('Conectado ao MySQL com sucesso na nuvem!');
    
    // Cria a tabela automaticamente caso seja um banco novo
    const sqlCriarTabela = `
        CREATE TABLE IF NOT EXISTS vagas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            titulo VARCHAR(255) NOT NULL,
            empresa VARCHAR(255) NOT NULL,
            localizacao VARCHAR(255) DEFAULT 'Manaus, AM',
            salario VARCHAR(255),
            email_contato VARCHAR(255),
            introducao TEXT,
            requisitos TEXT,
            atividades TEXT,
            descricao TEXT,
            data_publicacao DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    connection.query(sqlCriarTabela, (err) => {
        if (err) console.error('Erro ao criar tabela:', err);
        else console.log('Tabela "vagas" verificada/criada com sucesso!');
    });

    connection.release(); // Libera a conexão
});

// Rota para buscar vagas pela barra de pesquisa
app.get('/buscar', (req, res) => {
    const termo = req.query.q;
    const valor = `%${termo}%`;
    const sql = 'SELECT * FROM vagas WHERE titulo LIKE ? OR empresa LIKE ? ORDER BY data_publicacao DESC';
    
    db.query(sql, [valor, valor], (err, results) => {
        if (err) {
            return res.status(500).json({ erro: 'Erro no banco de dados' });
        }
        res.json(results);
    });
});

// Rota para buscar as vagas
app.get('/vagas', (req, res) => {
    const comandoSQL = 'SELECT * FROM vagas ORDER BY data_publicacao DESC';
    
    db.query(comandoSQL, (erro, resultados) => {
        if (erro) {
            res.status(500).send('Erro ao buscar as vagas');
            return;
        }
        res.json(resultados); 
    });
});

// Rota para cadastrar uma nova vaga no formato editorial
app.post('/vagas', (req, res) => {
    const { titulo, empresa, localizacao, salario, email_contato, introducao, requisitos, atividades } = req.body;
    
    // Incluímos a coluna 'descricao' recebendo a introdução para satisfazer o banco antigo
    const sql = `INSERT INTO vagas (titulo, empresa, localizacao, salario, email_contato, introducao, requisitos, atividades, descricao, data_publicacao) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`;
                 
    const valores = [
        titulo, 
        empresa, 
        localizacao || 'Manaus, AM', 
        salario || null, 
        email_contato, 
        introducao, 
        requisitos, 
        atividades,
        introducao // 👈 Preenche a descrição antiga automaticamente com o texto da introdução
    ];

    db.query(sql, valores, (err, result) => {
        if (err) {
            console.error('Erro ao cadastrar vaga:', err);
            return res.status(500).json({ erro: 'Erro ao salvar a vaga no banco de dados' });
        }
        res.json({ mensagem: 'Vaga cadastrada com sucesso!', id: result.insertId });
    });
});

// Configuração do transportador de e-mail (Usando o Gmail)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'techcontato777@gmail.com',      
        pass: 'hsbq xeko pkbb sgoo' 
    }
});

// Rota para processar o formulário de contato
app.post('/contato', (req, res) => {
    const { nome, email, assunto, mensagem } = req.body;

    const mailOptions = {
        from: email,
        to: 'techcontato777@gmail.com',
        subject: `[Portal Vagas] Nova mensagem de: ${nome} (${assunto})`,
        text: `Você recebeu uma nova mensagem pelo site Manaus Empregos:\n\nNome: ${nome}\nE-mail de Contato: ${email}\nAssunto: ${assunto}\n\nMensagem:\n${mensagem}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Erro ao enviar e-mail:', error);
            return res.status(500).json({ erro: 'Erro ao enviar o e-mail.' });
        }
        res.json({ mensagem: 'Mensagem enviada com sucesso por e-mail!' });
    });
});

// Rota pública para empresas SOLICITAREM anúncio
app.post('/solicitar-vaga', (req, res) => {
    const { titulo, empresa, localizacao, salario, email_contato, introducao, requisitos, atividades } = req.body;

    const mailOptions = {
        from: email_contato,
        to: 'techcontato777@gmail.com',
        subject: `[Nova Solicitação de Vaga] ${titulo} - ${empresa}`,
        text: `Uma empresa solicitou a publicação de uma vaga no portal:\n\nEmpresa: ${empresa}\nCargo: ${titulo}\nLocal: ${localizacao}\nSalário: ${salario || 'A combinar'}\nE-mail: ${email_contato}\n\nIntrodução:\n${introducao}\n\nRequisitos:\n${requisitos}\n\nAtividades:\n${atividades}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Erro ao enviar solicitação:', error);
            return res.status(500).json({ erro: 'Erro ao enviar solicitação por e-mail.' });
        }
        res.json({ mensagem: 'Solicitação enviada com sucesso para a administração do portal!' });
    });
});

// Rota para EDITAR uma vaga existente (Update)
app.put('/vagas/:id', (req, res) => {
    const id = req.params.id;
    const { titulo, empresa, localizacao, salario, email_contato, introducao, requisitos, atividades } = req.body;

    const sql = `UPDATE vagas SET titulo = ?, empresa = ?, localizacao = ?, salario = ?, email_contato = ?, introducao = ?, requisitos = ?, atividades = ? WHERE id = ?`;
    const valores = [titulo, empresa, localizacao, salario, email_contato, introducao, requisitos, atividades, id];

    db.query(sql, valores, (err, result) => {
        if (err) {
            console.error('Erro ao atualizar vaga:', err);
            return res.status(500).json({ erro: 'Erro ao atualizar no banco de dados' });
        }
        res.json({ mensagem: 'Vaga atualizada com sucesso!' });
    });
});

// Rota para EXCLUIR uma vaga (Delete)
app.delete('/vagas/:id', (req, res) => {
    const id = req.params.id;
    const sql = 'DELETE FROM vagas WHERE id = ?';
    
    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error('Erro ao excluir vaga:', err);
            return res.status(500).json({ erro: 'Erro ao excluir vaga' });
        }
        res.json({ mensagem: 'Vaga excluída com sucesso!' });
    });
});

// Rota para buscar os detalhes de uma vaga específica pelo ID
app.get('/vagas/:id', (req, res) => {
    const id = req.params.id;
    const sql = 'SELECT * FROM vagas WHERE id = ?';
    
    db.query(sql, [id], (err, results) => {
        if (err) {
            console.error('Erro ao buscar vaga:', err);
            return res.status(500).json({ erro: 'Erro no servidor' });
        }
        if (results.length === 0) {
            return res.status(404).json({ erro: 'Vaga não encontrada' });
        }
        res.json(results[0]);
    });
});

// Liga o servidor (Porta dinâmica para o Railway ou padrão 3000 local)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor do Portal rodando na porta ${PORT}`);
});