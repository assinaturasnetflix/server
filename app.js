// Variáveis globais
let selectedGroup = null;
let selectedMember = null;
let isLoggedIn = false;

// URL base da API
const API_BASE_URL = window.location.origin + '/api';

// Função principal para inicializar a aplicação
function initApp() {
    // Verificar status do servidor
    checkServerStatus();
    
    // Carregar grupos
    loadGroups();
    
    // Configurar eventos de tabs
    setupTabs();
    
    // Configurar evento de envio de mensagem
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    
    // Configurar evento de anexo
    document.getElementById('attach-btn').addEventListener('click', toggleFileUpload);
    
    // Configurar evento de atualização de grupos
    document.getElementById('refresh-groups').addEventListener('click', loadGroups);
    
    // Configurar eventos de mensagens em massa
    document.getElementById('bulk-send-btn').addEventListener('click', sendBulkMessages);
    
    // Configurar eventos de configurações
    document.getElementById('add-greeting').addEventListener('click', addGreetingInput);
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    
    // Carregar configurações
    loadSettings();
    
    // Verificar status a cada 30 segundos
    setInterval(checkServerStatus, 30000);
}

// Verificar status do servidor
async function checkServerStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/status`);
        const data = await response.json();
        
        const statusIndicator = document.getElementById('status-indicator');
        
        if (data.loggedIn) {
            statusIndicator.className = 'status-indicator status-online';
            statusIndicator.textContent = 'Online';
            isLoggedIn = true;
        } else {
            statusIndicator.className = 'status-indicator status-offline';
            statusIndicator.textContent = 'Aguardando Login';
            isLoggedIn = false;
        }
    } catch (error) {
        const statusIndicator = document.getElementById('status-indicator');
        statusIndicator.className = 'status-indicator status-offline';
        statusIndicator.textContent = 'Offline';
        isLoggedIn = false;
        console.error('Erro ao verificar status:', error);
    }
}

// Carregar lista de grupos
async function loadGroups() {
    try {
        const response = await fetch(`${API_BASE_URL}/groups`);
        const groups = await response.json();
        
        const groupList = document.getElementById('group-list');
        const bulkGroup = document.getElementById('bulk-group');
        
        // Limpar listas existentes
        groupList.innerHTML = '';
        
        // Manter apenas a opção padrão no select
        bulkGroup.innerHTML = '<option value="">Selecione um grupo</option>';
        
        if (groups.length === 0) {
            groupList.innerHTML = '<p>Nenhum grupo encontrado</p>';
            return;
        }
        
        // Adicionar grupos à lista
        groups.forEach(group => {
            // Lista na sidebar
            const groupItem = document.createElement('div');
            groupItem.className = 'group-item';
            groupItem.textContent = group.group_name;
            groupItem.dataset.name = group.group_name;
            groupItem.addEventListener('click', () => selectGroup(group.group_name));
            groupList.appendChild(groupItem);
            
            // Select para envio em massa
            const option = document.createElement('option');
            option.value = group.group_name;
            option.textContent = group.group_name;
            bulkGroup.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar grupos:', error);
        document.getElementById('group-list').innerHTML = '<p>Erro ao carregar grupos</p>';
    }
}

// Selecionar um grupo
async function selectGroup(groupName) {
    // Atualizar UI
    document.querySelectorAll('.group-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.name === groupName) {
            item.classList.add('active');
        }
    });
    
    selectedGroup = groupName;
    selectedMember = null;
    
    // Limpar chat
    document.getElementById('chat-title').textContent = 'Selecione um contato';
    document.getElementById('chat-messages').innerHTML = '<p class="empty-state">Selecione um contato para ver as mensagens</p>';
    document.getElementById('message-input').disabled = true;
    document.getElementById('send-btn').disabled = true;
    document.getElementById('attach-btn').disabled = true;
    
    // Carregar membros do grupo
    try {
        const memberList = document.getElementById('member-list');
        memberList.innerHTML = '<p>Carregando membros...</p>';
        
        const response = await fetch(`${API_BASE_URL}/group/${encodeURIComponent(groupName)}/members`);
        const members = await response.json();
        
        memberList.innerHTML = '';
        
        if (members.length === 0) {
            memberList.innerHTML = '<p>Nenhum membro encontrado</p>';
            return;
        }
        
        // Adicionar membros à lista
        members.forEach(member => {
            const memberItem = document.createElement('div');
            memberItem.className = 'member-item';
            memberItem.textContent = member.name || member.phone;
            memberItem.dataset.phone = member.phone;
            memberItem.addEventListener('click', () => selectMember(member));
            memberList.appendChild(memberItem);
        });
    } catch (error) {
        console.error('Erro ao carregar membros:', error);
        document.getElementById('member-list').innerHTML = '<p>Erro ao carregar membros</p>';
    }
}

// Selecionar um membro
async function selectMember(member) {
    // Atualizar UI
    document.querySelectorAll('.member-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.phone === member.phone) {
            item.classList.add('active');
        }
    });
    
    selectedMember = member;
    
    // Atualizar título do chat
    document.getElementById('chat-title').textContent = member.name || member.phone;
    
    // Habilitar campos de input
    document.getElementById('message-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('attach-btn').disabled = false;
    
    // Carregar mensagens
    await loadMessages(member.phone);
}

// Carregar mensagens de um contato
async function loadMessages(phone) {
    try {
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.innerHTML = '<p>Carregando mensagens...</p>';
        
        const response = await fetch(`${API_BASE_URL}/messages/${encodeURIComponent(phone)}`);
        const messages = await response.json();
        
        chatMessages.innerHTML = '';
        
        if (messages.length === 0) {
            chatMessages.innerHTML = '<p class="empty-state">Nenhuma mensagem encontrada</p>';
            return;
        }
        
        // Adicionar mensagens ao chat
        messages.forEach(message => {
            const messageElement = document.createElement('div');
            messageElement.className = `message message-${message.direction}`;
            
            const messageText = document.createElement('div');
            messageText.className = 'message-text';
            messageText.textContent = message.message;
            
            const messageTime = document.createElement('div');
            messageTime.className = 'message-time';
            messageTime.textContent = formatDateTime(message.timestamp);
            
            messageElement.appendChild(messageText);
            messageElement.appendChild(messageTime);
            
            chatMessages.appendChild(messageElement);
        });
        
        // Rolar para o final
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
        console.error('Erro ao carregar mensagens:', error);
        document.getElementById('chat-messages').innerHTML = '<p class="empty-state">Erro ao carregar mensagens</p>';
    }
}

// Enviar mensagem
async function sendMessage() {
    if (!selectedMember) return;
    
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    
    if (!message) return;
    
    try {
        // Limpar input
        messageInput.value = '';
        
        // Enviar mensagem para a API
        const response = await fetch(`${API_BASE_URL}/send-message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phone: selectedMember.phone,
                message: message
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Recarregar mensagens
            await loadMessages(selectedMember.phone);
        } else {
            alert('Erro ao enviar mensagem');
        }
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        alert('Erro ao enviar mensagem');
    }
}

// Toggle para upload de arquivo
function toggleFileUpload() {
    // Implementação simplificada - abriria um diálogo para selecionar arquivo
    alert('Funcionalidade de envio de arquivos disponível apenas via API');
}

// Enviar mensagens em massa
async function sendBulkMessages() {
    const bulkGroup = document.getElementById('bulk-group').value;
    const bulkMessage = document.getElementById('bulk-message').value.trim();
    const bulkFile = document.getElementById('bulk-file').files[0];
    
    if (!bulkGroup || !bulkMessage) {
        showStatus('bulk-status', 'Grupo e mensagem são obrigatórios', 'error');
        return;
    }
    
    try {
        // Desabilitar botão
        document.getElementById('bulk-send-btn').disabled = true;
        showStatus('bulk-status', 'Enviando mensagens, isso pode levar algum tempo...', 'success');
        
        // Enviar mensagem para a API
        const formData = new FormData();
        formData.append('groupName', bulkGroup);
        formData.append('message', bulkMessage);
        
        if (bulkFile) {
            formData.append('file', bulkFile);
        }
        
        const response = await fetch(`${API_BASE_URL}/bulk-send`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        // Habilitar botão
        document.getElementById('bulk-send-btn').disabled = false;
        
        if (result.success) {
            showStatus('bulk-status', result.message, 'success');
        } else {
            showStatus('bulk-status', result.message || 'Erro ao enviar mensagens', 'error');
        }
    } catch (error) {
        console.error('Erro ao enviar mensagens em massa:', error);
        document.getElementById('bulk-send-btn').disabled = false;
        showStatus('bulk-status', 'Erro ao enviar mensagens', 'error');
    }
}

// Carregar configurações
async function loadSettings() {
    try {
        const response = await fetch(`${API_BASE_URL}/settings`);
        const settings = await response.json();
        
        // Preencher resposta automática
        if (settings.auto_reply) {
            document.getElementById('auto-reply').value = settings.auto_reply;
        }
        
        // Preencher mensagens de saudação
        if (settings.greeting_messages && Array.isArray(settings.greeting_messages)) {
            const greetingContainer = document.getElementById('greeting-messages');
            
            // Limpar mensagens existentes, mantendo apenas o botão de adicionar
            const addButton = document.getElementById('add-greeting');
            greetingContainer.innerHTML = '';
            greetingContainer.appendChild(addButton);
            
            // Adicionar mensagens de saudação
            settings.greeting_messages.forEach(greeting => {
                addGreetingInput(greeting);
            });
        }
    } catch (error) {
        console.error('Erro ao carregar configurações:', error);
    }
}

// Adicionar input para mensagem de saudação
function addGreetingInput(value = '') {
    const greetingContainer = document.getElementById('greeting-messages');
    const addButton = document.getElementById('add-greeting');
    
    const greetingItem = document.createElement('div');
    greetingItem.className = 'greeting-item';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Mensagem de saudação...';
    input.value = value;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '❌';
    removeBtn.addEventListener('click', () => {
        greetingContainer.removeChild(greetingItem);
    });
    
    greetingItem.appendChild(input);
    greetingItem.appendChild(removeBtn);
    
    // Inserir antes do botão de adicionar
    greetingContainer.insertBefore(greetingItem, addButton);
}

// Salvar configurações
async function saveSettings() {
    try {
        // Obter resposta automática
        const autoReply = document.getElementById('auto-reply').value.trim();
        
        // Obter mensagens de saudação
        const greetingInputs = document.querySelectorAll('#greeting-messages .greeting-item input');
        const greetingMessages = Array.from(greetingInputs).map(input => input.value.trim()).filter(value => value);
        
        // Verificar se há pelo menos uma mensagem de saudação
        if (greetingMessages.length === 0) {
            showStatus('settings-status', 'Adicione pelo menos uma mensagem de saudação', 'error');
            return;
        }
        
        // Salvar resposta automática
        await fetch(`${API_BASE_URL}/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                key: 'auto_reply',
                value: autoReply
            })
        });
        
        // Salvar mensagens de saudação
        await fetch(`${API_BASE_URL}/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                key: 'greeting_messages',
                value: greetingMessages
            })
        });
        
        showStatus('settings-status', 'Configurações salvas com sucesso', 'success');
    } catch (error) {
        console.error('Erro ao salvar configurações:', error);
        showStatus('settings-status', 'Erro ao salvar configurações', 'error');
    }
}

// Configurar tabs
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            
            // Atualizar botões
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Atualizar conteúdo
            tabContents.forEach(content => {
                content.classList.add('hidden');
                if (content.id === `${tabId}-tab`) {
                    content.classList.remove('hidden');
                }
            });
        });
    });
}

// Exibir mensagem de status
function showStatus(elementId, message, type) {
    const statusElement = document.getElementById(elementId);
    statusElement.textContent = message;
    statusElement.className = `status-message status-${type}`;
    
    // Ocultar após 5 segundos
    setTimeout(() => {
        statusElement.className = 'status-message';
    }, 5000);
}

// Formatar data e hora
function formatDateTime(isoString) {
    if (!isoString) return '';
    
    const date = new Date(isoString);
    return date.toLocaleString();
}

// Inicializar aplicação quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', initApp);