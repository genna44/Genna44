// Logica mazzi personalizzati "Fai da Te" estratta da script.js.

import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { db } from './firebaseInit.js';
import { getCurrentUser, getUserData } from './script.js';

// --- LOGICA MAZZI FAI DA TE (TAILORED) ---

export let customDecks = JSON.parse(localStorage.getItem('jap_custom_decks')) || [];
export let currentActiveDeckIndex = null;

// Esponiamole globalmente nel caso servano all'HTML, ma teniamo il 'let' per farle funzionare dentro questo file JS
window.customDecks = customDecks;
window.currentActiveDeckIndex = currentActiveDeckIndex;
window.saveCustomDecks = () => {
    localStorage.setItem('jap_custom_decks', JSON.stringify(customDecks));
    if(getCurrentUser()) {
        getUserData().customDecks = customDecks;
        updateDoc(doc(db,"users",getCurrentUser().uid), {customDecks: customDecks}).catch(console.error);
    }
};
// Mostra la schermata principale
window.showCustomDecks = () => {
    // 1. Controllo sicuro per il tutorial
    const tutorialModal = document.getElementById('custom-decks-tutorial-modal');
    if (tutorialModal) {
        // Se l'HTML esiste, controlla se deve mostrarlo
        if (localStorage.getItem('hideCustomDecksTutorial') !== 'true') {
            tutorialModal.classList.remove('hidden');
        }
    } else {
        console.warn("Avviso: Manca l'HTML del tutorial (custom-decks-tutorial-modal).");
    }

    window.showView('view-custom-decks'); 
    
    // 2. Controllo sicuro per l'area lista
    const listArea = document.getElementById('custom-decks-list-area');
    if (listArea) {
        listArea.classList.remove('hidden');
    } else {
        console.warn("Avviso: Manca l'HTML per custom-decks-list-area.");
    }
    
    // 3. Controllo sicuro per l'area dettagli
    const detailArea = document.getElementById('custom-deck-detail-area');
    if (detailArea) {
        detailArea.classList.add('hidden');
    }
    
    window.renderCustomDecks(); 
};

window.renderCustomDecks = () => {
    const containerMine = document.getElementById('custom-decks-container');
    const containerShared = document.getElementById('shared-decks-container');
    
    if(containerMine) containerMine.innerHTML = '';
    if(containerShared) containerShared.innerHTML = '';

    let hasMine = false;
    let hasShared = false;

    customDecks.forEach((deck, index) => {
        const cardCount = deck.cards ? deck.cards.length : 0;
        const isShared = deck.shared === true;
        
        // Se è condiviso, mettiamo la targhetta con il nome dell'amico
        const badge = isShared ? `<span style="background:rgba(99, 102, 241, 0.1); color:#6366f1; padding:2px 8px; border-radius:8px; font-size:0.75rem; margin-left:5px;">Da ${deck.ownerName || 'Amico'}</span>` : '';
        
        const html = `
            <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:15px; padding:20px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; transition:0.2s;" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='var(--border)'">
                <div onclick="window.openCustomDeck(${index})" style="flex:1;">
                    <h3 style="margin:0 0 5px 0; color:var(--text-main); font-size:1.2rem;">${deck.name} ${badge}</h3>
                    <div style="color:var(--text-sub); font-size:0.9rem;">${cardCount} vocaboli ${isShared ? (deck.permission === 'read' ? ' • <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> Lettura' : ' • <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Modificabile') : ''}</div>
                </div>
                <button onclick="window.deleteCustomDeck(${index})" style="background:transparent; border:none; color:#ef4444; font-size:1.5rem; cursor:pointer;" title="Elimina Mazzo"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg></button>
            </div>
        `;

        // Smista i mazzi tra i "Tuo" e quelli "Condivisi"
        if (isShared) {
            hasShared = true;
            if(containerShared) containerShared.innerHTML += html;
        } else {
            hasMine = true;
            if(containerMine) containerMine.innerHTML += html;
        }
    });

    if (!hasMine && containerMine) containerMine.innerHTML = '<p style="color:var(--text-sub); text-align:center; padding:20px;">Non hai ancora creato nessun mazzo.</p>';
    if (!hasShared && containerShared) containerShared.innerHTML = '<p style="color:var(--text-sub); text-align:center; padding:20px;">Nessun mazzo condiviso con te al momento.</p>';
};

// Gestione creazione ed eliminazione
window.createNewDeck = () => {
    const nameInput = document.getElementById('new-deck-name');
    const name = nameInput.value.trim();

    // Se è vuoto, mostra l'errore rosso
    if (!name) {
        window.showToast("Scrivi prima un nome per il mazzo!", true); // Aggiunto window.
        return;
    }

    customDecks.push({ name: name, cards: [] });
    window.saveCustomDecks(); // Aggiunto window.
    nameInput.value = '';
    window.renderCustomDecks(); // Aggiunto window.
    
    // Se va a buon fine, mostra la notifica verde
    window.showToast("Mazzo '" + name + "' creato con successo!"); // Aggiunto window.
};

// Navigazione interno mazzo
window.openCustomDeck = (index) => {
    currentActiveDeckIndex = index;
    const deck = customDecks[index];
    
    document.getElementById('custom-decks-list-area').classList.add('hidden');
    document.getElementById('custom-deck-detail-area').classList.remove('hidden');
    document.getElementById('current-deck-title').innerText = deck.name;
    
    window.renderCustomCards(); // Aggiunto window.
};

window.customDecksBack = () => {
    const detailArea = document.getElementById('custom-deck-detail-area');
    if (detailArea && !detailArea.classList.contains('hidden')) {
        window.closeDeckDetail();
    } else {
        window.goBack();
    }
};

window.closeDeckDetail = () => {
    document.getElementById('custom-deck-detail-area').classList.add('hidden');
    document.getElementById('custom-decks-list-area').classList.remove('hidden');
    currentActiveDeckIndex = null;
    window.renderCustomDecks(); // Aggiunto window.
};

window.addCardToCurrentDeck = () => {
    const k = document.getElementById('custom-k').value.trim();
    const r = document.getElementById('custom-r').value.trim();
    const s = document.getElementById('custom-s').value.trim();

    if (!k || !r || !s) {
        window.showToast("Compila tutti i campi prima di aggiungere!", true);
        return;
    }

    // --- BLOCCO ANTI-DOPPIONI ---
    // Controlla se esiste già una carta con lo stesso kanji/vocabolo in questo mazzo
    const deck = customDecks[currentActiveDeckIndex];
    const isDuplicate = deck.cards.some(card => card.k === k);
    
    if (isDuplicate) {
        window.showToast("Questo vocabolo è già presente in questo mazzo!", true);
        return; // Ferma tutto, non lo aggiunge!
    }
    // ----------------------------

    deck.cards.push({ k: k, r: r, s: s });
    window.saveCustomDecks(); 
    
    // Pulisce le caselle dopo l'aggiunta
    document.getElementById('custom-k').value = '';
    document.getElementById('custom-r').value = '';
    document.getElementById('custom-s').value = '';
    
    window.renderCustomCards(); 
    window.showToast("Vocabolo aggiunto al mazzo!"); 
};

window.renderCustomCards = () => {
    const deck = customDecks[currentActiveDeckIndex];
    const container = document.getElementById('custom-cards-container');
    container.innerHTML = '';
    
    document.getElementById('custom-deck-count').innerText = deck.cards.length;
    
    const btnQuiz = document.getElementById('btn-start-custom-quiz');
    if(deck.cards.length > 0) {
        btnQuiz.disabled = false;
        btnQuiz.style.opacity = '1';
    } else {
        btnQuiz.disabled = true;
        btnQuiz.style.opacity = '0.5';
    }

    // GESTIONE PERMESSI (Nasconde l'input e il bottone Condividi se è in sola lettura)
    const addBox = document.getElementById('custom-deck-add-box');
    const shareBtn = document.getElementById('btn-share-deck');
    
    if (deck.permission === 'read') {
        if(addBox) addBox.classList.add('hidden'); // Non puoi aggiungere
        if(shareBtn) shareBtn.classList.add('hidden'); // Non puoi ricondividere un mazzo read-only
    } else {
        if(addBox) addBox.classList.remove('hidden');
        if(shareBtn) shareBtn.classList.remove('hidden');
    }

    deck.cards.forEach((card, i) => {
        // Tasto elimina nascosto se in sola lettura
        const deleteBtn = deck.permission === 'read' ? '' : `<button onclick="window.removeCardFromDeck(${i})" style="background:transparent; border:none; color:var(--text-sub); cursor:pointer; font-size:1.2rem;">✕</button>`;

        container.innerHTML += `
            <div style="background:var(--bg-body); border-radius:12px; padding:15px; display:flex; justify-content:space-between; align-items:center; border:1px solid var(--border);">
                <div>
                    <div style="font-size:1.3rem; font-weight:bold; color:var(--text-main);">${card.k} <span style="font-size:0.9rem; color:var(--primary); font-weight:normal;">(${card.r})</span></div>
                    <div style="color:var(--text-sub); font-size:0.9rem; margin-top:3px;">${card.s}</div>
                </div>
                ${deleteBtn}
            </div>
        `;
    });
};

window.removeCardFromDeck = (cardIndex) => {
    customDecks[currentActiveDeckIndex].cards.splice(cardIndex, 1);
    window.saveCustomDecks(); // Aggiunto window.
    window.renderCustomCards(); // Aggiunto window.
};

window.startCustomDeckQuiz = () => {
    const deck = customDecks[currentActiveDeckIndex];
    if (!deck || deck.cards.length === 0) {
        window.showToast("Aggiungi almeno una carta per poterti esercitare!", true);
        return;
    }
    // Usa la funzione esposta da script.js (le variabili currentDB/chosen/mode sono module-scoped lì)
    window.startQuizWithDeck(deck.cards);
    const btnAll = document.querySelector('#view-selection div[onclick="toggleSelectAll()"]');
    if (btnAll) btnAll.innerText = "Seleziona Tutto";
};






window.openCustomDecksTutorial = () => {
    document.getElementById('custom-decks-tutorial-modal').classList.remove('hidden');
};

window.closeCustomDecksTutorial = () => {
    const checkbox = document.getElementById('hide-custom-decks-tutorial-checkbox');
    // Se la spunta è attiva, salviamo la preferenza nel browser
    if (checkbox && checkbox.checked) {
        localStorage.setItem('hideCustomDecksTutorial', 'true');
    }
    document.getElementById('custom-decks-tutorial-modal').classList.add('hidden');
};

// ==========================================
// FIX 1: FUNZIONE PER ELIMINARE IL MAZZO
// ==========================================
window.deleteCustomDeck = (index) => {
    // Usa il tuo popup personalizzato
    window.showCustomConfirm("Sei sicuro di voler eliminare questo mazzo? L'azione è irreversibile.", () => {
        // Rimuove il mazzo dall'array
        customDecks.splice(index, 1);
        // Salva nel Local Storage
        window.saveCustomDecks();
        // Ricarica la grafica
        window.renderCustomDecks();
        // Mostra il fumetto di conferma
        window.showToast("Mazzo eliminato con successo!", true);
    });
};

// ==========================================
// FIX 2: AUTOCOMPLETAMENTO KANJI
// ==========================================
// Questa funzione si attiva appena la pagina ha finito di caricare
document.addEventListener("DOMContentLoaded", () => {
    const kanjiInput = document.getElementById('custom-k');
    const romajiInput = document.getElementById('custom-r');
    const meaningInput = document.getElementById('custom-s');

    if (kanjiInput && romajiInput && meaningInput) {
        // "Ascolta" ogni volta che digiti o incolli qualcosa nella casella Kanji
        kanjiInput.addEventListener('input', (e) => {
            const testoInserito = e.target.value.trim();
            
            if (!testoInserito) return; // Se è vuoto, non fa nulla

            // Cerca nel database globale se esiste questo kanji
            const kanjiTrovato = window.kanjiData.find(item => item.k === testoInserito);

            // Se lo trova, riempie automaticamente le altre due caselle!
            if (kanjiTrovato) {
                romajiInput.value = kanjiTrovato.r;
                meaningInput.value = kanjiTrovato.s;
                
                // Opzionale: un micro-feedback visivo per far capire che ha fatto da solo
                romajiInput.style.backgroundColor = "rgba(16, 185, 129, 0.1)"; // Verdino
                meaningInput.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
                setTimeout(() => {
                    romajiInput.style.backgroundColor = "";
                    meaningInput.style.backgroundColor = "";
                }, 500);
            }
        });
    }
});

window.currentVocabToAdd = null; // Memoria temporanea per la parola cliccata

// Funzione intelligente per separare "Ieri (きのう)" in significato e lettura
window.parseVocabString = (kanji, textInfo) => {
    let significato = textInfo;
    let lettura = kanji; // Di base, se non c'è l'hiragana, usa il kanji stesso
    
    // Cerca qualcosa scritto tra parentesi tonde (sia occidentali che giapponesi)
    const match = textInfo.match(/(.+?)\s*[\(（](.+?)[\)）]/);
    if (match) {
        significato = match[1].trim();
        lettura = match[2].trim();
    }
    return { k: kanji, r: lettura, s: significato };
};

// Apre il popup per scegliere il mazzo
window.openAddToDeckModal = () => {
    if (!window.currentVocabToAdd) return;

    // Crea lo sfondo scuro sfocato (stile moderno)
    const overlay = document.createElement('div');
    overlay.id = 'add-to-deck-overlay';
    overlay.className = 'popup-overlay';

    // Crea il box centrale
    const box = document.createElement('div');
    box.className = 'popup-box';

    let html = `<h3 style="margin-top:0; color:var(--text-main); font-size:1.3rem;">Aggiungi al Mazzo</h3>`;
    html += `<p style="color:var(--text-sub); margin-bottom:20px; font-size:0.95rem;">Scegli dove salvare <b>${window.currentVocabToAdd.k}</b>:</p>`;

    // Mostra la lista dei mazzi esistenti
    if (customDecks.length > 0) {
        html += `<div style="max-height:200px; overflow-y:auto; display:flex; flex-direction:column; gap:10px; margin-bottom:20px; padding-right:5px;">`;
        customDecks.forEach((deck, i) => {
            html += `<button onclick="window.confirmAddVocabToDeck(${i})" style="padding:12px; border-radius:12px; background:var(--bg-body); border:1px solid var(--border); color:var(--text-main); cursor:pointer; text-align:left; font-weight:bold; transition:0.2s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> ${deck.name} <span style="float:right; color:var(--text-sub); font-size:0.85rem;">${deck.cards ? deck.cards.length : 0} carte</span></button>`;
        });
        html += `</div>`;
    } else {
        html += `<p style="color:var(--primary); font-size:0.9rem; margin-bottom:15px; font-weight:bold;">Non hai ancora nessun mazzo.</p>`;
    }

    // Input per creare un mazzo al volo
    html += `
        <div style="display:flex; gap:10px; margin-bottom:20px;">
            <input type="text" id="quick-new-deck-name" placeholder="Nome nuovo mazzo..." style="flex:1; padding:12px; border-radius:12px; border:1px solid var(--border); background:var(--bg-body); color:var(--text-main); outline:none;">
            <button onclick="window.quickCreateAndAddDeck()" style="padding:10px 15px; border-radius:12px; background:var(--primary); color:white; border:none; cursor:pointer; font-weight:bold; transition:0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">Crea & Salva</button>
        </div>
        <button onclick="document.getElementById('add-to-deck-overlay').remove()" style="width:100%; padding:12px; border-radius:12px; background:transparent; border:2px solid var(--border); color:var(--text-main); cursor:pointer; font-weight:bold; transition:0.2s;">Annulla</button>
    `;

    box.innerHTML = html;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Animazione entrata
    setTimeout(() => overlay.classList.add('show'), 10);
};

// Funzione finale: salva nel mazzo scelto
window.confirmAddVocabToDeck = (index) => {
    const vocab = window.currentVocabToAdd;
    // Evita i doppioni!
    const isDup = customDecks[index].cards.some(c => c.k === vocab.k);
    if (isDup) {
        window.showToast("Questa parola è già nel mazzo!", true);
    } else {
        customDecks[index].cards.push(vocab);
        window.saveCustomDecks();
        window.showToast(`Aggiunto a ${customDecks[index].name}!`);
        // Se stiamo guardando proprio i mazzi, aggiorna la grafica
        if(document.getElementById('custom-decks-list-area') && !document.getElementById('custom-decks-list-area').classList.contains('hidden')) {
            window.renderCustomDecks();
        }
    }
    document.getElementById('add-to-deck-overlay').remove();
    window.closeVocab(); // Chiude anche il popup del vocabolario
};

// Funzione finale: crea un mazzo e ci salva la parola
window.quickCreateAndAddDeck = () => {
    const name = document.getElementById('quick-new-deck-name').value.trim();
    if (!name) return window.showToast("Inserisci un nome per il mazzo!", true);
    
    const vocab = window.currentVocabToAdd;
    customDecks.push({ name: name, cards: [vocab] });
    window.saveCustomDecks();
    window.showToast(`Mazzo '${name}' creato con la parola!`);
    
    if(document.getElementById('custom-decks-list-area') && !document.getElementById('custom-decks-list-area').classList.contains('hidden')) {
        window.renderCustomDecks();
    }
    document.getElementById('add-to-deck-overlay').remove();
    window.closeVocab();
};
