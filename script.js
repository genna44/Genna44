import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
    import { doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, orderBy, getDocs, onSnapshot, addDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
    import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { n5Kanji, n4Kanji, n3Kanji, n2Kanji, n1Kanji, adjData, hiraData, kataData, verbData, countersData, readingTexts, booksData, formNames, adjFormNames, particlesData, n5KanjiDetail, n4KanjiDetail, n3KanjiDetail } from './data.js';
import { conjugate, conjugateKana, getExplanation } from './verbEngine.js';
import { app, auth, db, storage } from './firebaseInit.js';
import { showToast, showCustomConfirm } from './uiUtils.js';
import { customDecks, currentActiveDeckIndex } from './customDecks.js';

window.showToast = showToast;
window.showCustomConfirm = showCustomConfirm;




let comboAttuale = 0;
let comboMassima = 0;
let kanjiSbagliati = []; // Salva i kanji dove si sbaglia o si chiede aiuto
let aiutiUsati = 0;
let _navStack = [];
let _isGoingBack = false;
let currentReplyParentId = null;

    // --- DATI DIDATTICI ---
    
// Kanji JLPT: array flat per compatibilità con tutto il resto del sito
    window.n5Kanji = n5Kanji;
    window.n4Kanji = n4Kanji;
    window.n3Kanji = n3Kanji;
    window.n2Kanji = n2Kanji;
    window.n1Kanji = n1Kanji;
    window.kanjiData = [...n5Kanji, ...n4Kanji, ...n3Kanji, ...n2Kanji, ...n1Kanji];
    window.n5KanjiDetail = n5KanjiDetail;
    window.n4KanjiDetail = n4KanjiDetail;
    window.n3KanjiDetail = n3KanjiDetail;
    window._allKanjiDetailMap = {};
    [...n5KanjiDetail, ...n4KanjiDetail, ...n3KanjiDetail].forEach(e => { window._allKanjiDetailMap[e.k] = e; });
    window._n5MeaningsMap = {};
    n5KanjiDetail.forEach(entry => { window._n5MeaningsMap[entry.k] = entry.m; });
    window._getMeanings = (k) => {
        if (!window._n5MeaningsMap) return null;
        if (window._n5MeaningsMap[k]) return window._n5MeaningsMap[k];
        const kanjiOnly = k.replace(/[぀-ヿ]+$/, '');
        return (kanjiOnly !== k && window._n5MeaningsMap[kanjiOnly]) ? window._n5MeaningsMap[kanjiOnly] : null;
    };
    window._tradMode = false;
    window._inTranslationPhase = false;


    // g: 1 (Godan/Consonantici), g: 2 (Ichidan/Vocalici), g: 3 (Irregolari)
    
    window.verbiList = verbData;
    


    // --- DATI LETTURA ---
    

    // --- DATI LIBRI (FASE 2) ---
    
   

    let currentReadingText = null;

    window.startReadingMode = (id) => {
        if (localStorage.getItem('hideReadingTutorial') !== 'true') {
        document.getElementById('reading-tutorial-modal').classList.remove('hidden');
    }
        currentReadingText = readingTexts.find(t => t.id === id);
        if (!currentReadingText) return;
        
        document.getElementById('read-title').innerText = currentReadingText.title;
        document.getElementById('read-level').innerText = currentReadingText.level;
        
        // Genera il testo con le parole cliccabili
        let htmlText = currentReadingText.text;
        for (let word in currentReadingText.vocab) {
            let regex = new RegExp(word, 'g');
            htmlText = htmlText.replace(regex, `<span class="clickable-word" onclick="showVocab('${word}')">${word}</span>`);
        }
        document.getElementById('reading-display').innerHTML = htmlText;
        
        // Reset UI e Fasi
        document.getElementById('prog-lettura').style.width = '0%';
        document.getElementById('prog-traduzione').style.width = '0%';
        document.getElementById('vocab-popup').classList.add('hidden');
        
        document.getElementById('reading-input').value = '';
        document.getElementById('user-translation-input').value = ''; // Pulisce la tua traduzione
        document.getElementById('phase-reading').classList.remove('hidden');
        document.getElementById('phase-translation-input').classList.add('hidden');
        document.getElementById('translation-eval').classList.add('hidden');
        
        showView('view-reading-mode');
        window.checkSectionTutorial?.('reading');
    };

    window.showVocab = (word) => {
        if (window.currentReadingMode === 'hard') return;

        const meaning = currentReadingText.vocab[word];
        let testoFinale = meaning;

        if (window.currentReadingMode === 'medium') {
            testoFinale = meaning.replace(/\s*[\(（][^\)）]*[\)）]/g, '');
        }

        // FIX: Memorizza la parola per poterla aggiungere ai mazzi!
        window.currentVocabToAdd = window.parseVocabString(word, meaning);

        document.getElementById('vocab-word').innerText = word;
        document.getElementById('vocab-meaning').innerText = testoFinale;
        document.getElementById('vocab-popup').classList.remove('hidden');
    };

    window.showOfficialTranslation = () => {
    // Prende il testo scritto dall'utente e lo inserisce nel box di confronto
    const userText = document.getElementById('user-translation-input').value.trim();
    document.getElementById('user-translation-display').textContent = userText !== "" ? userText : "(Nessuna traduzione inserita)";
    
    // Nasconde la Fase 2 e mostra la Fase 3
    document.getElementById('phase-translation-input').classList.add('hidden');
    document.getElementById('translation-eval').classList.remove('hidden');
};

    // Motore di controllo Lettura (Livello 1 e Livello 2) a prova di punteggiatura
window.checkReading = () => {
    let inputVal = document.getElementById('reading-input').value.trim();
    if (!inputVal) return;

    // Pulisce TUTTA la punteggiatura e gli spazi (sia occidentali che giapponesi)
    let cleanInput = inputVal.replace(/[\s、。！？,.\?!・　]/g, '').toLowerCase();
    
    if (currentReadingText.segments) {
        // --- CONTROLLO LIVELLO 2 ---
        const seg = currentReadingText.segments[currentSegmentIndex];
        let cleanTarget = seg.hira.replace(/[\s、。！？,.\?!・　]/g, '').toLowerCase();

        if (cleanInput === cleanTarget) {
            // Lettura Corretta! Passa alla traduzione
            document.getElementById('phase-reading').classList.add('hidden');
            document.getElementById('phase-translation-input').classList.remove('hidden');
            document.getElementById('official-translation').innerText = seg.it;
            
            // La barra della lettura fa un passetto in avanti
            let progress = Math.round(((currentSegmentIndex + 1) / currentReadingText.segments.length) * 100);
            document.getElementById('prog-lettura').style.width = progress + "%";
        } else {
            // Lettura Errata (Lampeggia di rosso)
            document.getElementById('reading-input').style.borderColor = "#ef4444";
            setTimeout(() => document.getElementById('reading-input').style.borderColor = "#10b981", 800);
        }
    } else {
        // --- CONTROLLO LIVELLO 1 ---
        // FIX: Usa 'hiraganaText' al posto di 'hira'!
        let targetText = currentReadingText.hiraganaText || currentReadingText.hira;
        let cleanTarget = targetText.replace(/[\s、。！？,.\?!・　]/g, '').toLowerCase();
        
        if (cleanInput === cleanTarget) {
            document.getElementById('phase-reading').classList.add('hidden');
            document.getElementById('phase-translation-input').classList.remove('hidden');
            document.getElementById('official-translation').innerText = currentReadingText.it || currentReadingText.translation;
        } else {
            document.getElementById('reading-input').style.borderColor = "#ef4444";
            setTimeout(() => document.getElementById('reading-input').style.borderColor = "#10b981", 800);
        }
    }
};

    window._readingNoPressed = window._readingNoPressed || false;

    window.finishReadingSegment = async (understood) => {
    if (!understood) {
        if (!window._readingNoPressed) {
            // Prima pressione: mostra popup incoraggiamento
            window._readingNoPressed = true;
            const existing = document.getElementById('reading-no-overlay');
            if (existing) existing.remove();
            const ov = document.createElement('div');
            ov.id = 'reading-no-overlay';
            ov.style = "position:fixed;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s;";
            ov.innerHTML = `
                <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:20px;padding:32px 28px;max-width:360px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.4);transform:scale(0.88);transition:transform 0.2s;">
                    <div style="font-size:2.4rem;margin-bottom:12px;">📖</div>
                    <h3 style="margin:0 0 10px;color:var(--text-main);font-size:1.15rem;">Rileggi con calma</h3>
                    <p style="color:var(--text-sub);font-size:0.92rem;margin:0 0 24px;line-height:1.55;">Prenditi il tuo tempo per rileggere la frase e capire la struttura grammaticale.</p>
                    <button onclick="document.getElementById('reading-no-overlay').remove()"
                        style="width:100%;padding:13px;background:#6366f1;border:none;border-radius:12px;color:white;font-weight:800;font-size:1rem;cursor:pointer;transition:0.2s;"
                        onmouseover="this.style.background='#4f46e5'" onmouseout="this.style.background='#6366f1'">
                        Rileggo! ✓
                    </button>
                </div>`;
            document.body.appendChild(ov);
            requestAnimationFrame(() => {
                ov.style.opacity = '1';
                ov.querySelector('div').style.transform = 'scale(1)';
            });
            return;
        }
        // Seconda pressione: procede segnando la risposta come errata
        window._readingNoPressed = false;
        // lascia cadere nel blocco sottostante (understood = false non blocca più)
    }

    // Inizializza l'oggetto se non esiste
    if (!userData.readingProgress) userData.readingProgress = {};

    if (currentReadingText.segments) {
        // --- LIVELLO 2 ---
        currentSegmentIndex++;
        userData.readingProgress[currentReadingText.id] = currentSegmentIndex;

        if (currentSegmentIndex >= currentReadingText.segments.length) {
            document.getElementById('prog-traduzione').style.width = "100%";
            document.getElementById('reading-result-score').innerText = "100%";
            showView('view-reading-result');
        } else {
            loadSegment();
        }
    } else {
        // --- LIVELLO 1 ---
        userData.readingProgress[currentReadingText.id] = 1; // 1 significa 'Completato'
        document.getElementById('prog-traduzione').style.width = "100%";
        document.getElementById('reading-result-score').innerText = "100%";
        showView('view-reading-result');
    }

    // SALVATAGGIO REALE SU FIREBASE
    if (currentUser) {
        try {
            const userRef = doc(db, "users", currentUser.uid);
            await updateDoc(userRef, { 
                readingProgress: userData.readingProgress 
            });
            console.log("Progresso salvato correttamente!");
        } catch (e) {
            console.error("Errore durante il salvataggio su Firebase:", e);
        }
    }
};


window.renderReadingSelection = () => {
    const levelContainer = document.getElementById('level-selection-container');
    const textContainer = document.getElementById('text-selection-container');
    
    if (levelContainer && textContainer) {
        // Forza la visualizzazione dei Livelli e nasconde i Testi
        levelContainer.style.display = 'block';
        textContainer.style.display = 'none';
        
        // Assicuriamoci di chiudere l'anteprima se era rimasta aperta
        const previewModal = document.getElementById('view-reading-preview');
        if(previewModal) previewModal.classList.add('hidden');
        
        showView('view-reading-select'); 
    } else {
        console.error("Errore: Non trovo i contenitori!");
    }
};

window.openLevel = (levelName, colorCode) => {
    document.getElementById('level-selection-container').style.display = 'none';
    document.getElementById('text-selection-container').style.display = 'block';
    
    const titleEl = document.getElementById('selected-level-title');
    titleEl.innerText = levelName;
    titleEl.style.color = colorCode;

    const listContainer = document.getElementById('reading-list-dynamic');
    listContainer.innerHTML = ''; 
    
    // --- SE È IL LIVELLO 3: MOSTRA LA GRIGLIA DEI LIBRI ---
    if (levelName === 'Livello 3') {
        listContainer.style.display = 'grid';
        listContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(120px, 1fr))';
        listContainer.style.gap = '20px';
        
        booksData.forEach(book => {
            const card = document.createElement('div');
            card.style = `cursor: pointer; border-radius: 12px; overflow: hidden; background: var(--bg-card); border: 1px solid var(--border); box-shadow: 0 4px 15px rgba(0,0,0,0.1); transition: transform 0.2s;`;
            card.onmouseover = () => card.style.transform = 'scale(1.05)';
            card.onmouseout = () => card.style.transform = 'scale(1)';
            card.onclick = () => window.openBook(book.id, colorCode); // Apre la vista Netflix
            
            card.innerHTML = `
                <div style="height: 180px; background-image: url('${book.cover}'); background-size: cover; background-position: center;"></div>
                <div style="padding: 12px 10px;">
                    <div style="font-weight: bold; color: var(--text-main); font-size: 0.95rem; line-height: 1.2; margin-bottom: 4px;">${book.title}</div>
                    <div style="font-size: 0.75rem; color: var(--text-sub);">${book.author}</div>
                </div>
            `;
            listContainer.appendChild(card);
        });
        return; // Ferma l'esecuzione qui per il Livello 3
    }

    // --- SE È LIVELLO 1 O 2: LOGICA NORMALE A LISTA ---
    listContainer.style.display = 'block'; // Ripristina layout a lista
    const texts = readingTexts.filter(t => t.level === levelName);

    if(texts.length === 0) {
        listContainer.innerHTML = `<p style="text-align:center; color: var(--text-sub); margin-top: 20px;">Nessun testo disponibile.</p>`;
        return;
    }

    texts.forEach(textObj => {
        const btn = document.createElement('div'); 
        btn.className = "reading-item-card";
        
        // FIX: Aggiunto 'transition: 0.2s;' alla fine dello style!
        btn.style = `display:flex; justify-content:space-between; align-items:center; padding:15px 20px; border:1px solid var(--border); border-radius:12px; background:var(--bg-body); cursor:pointer; margin-bottom:10px; transition: 0.2s;`;
        
        // FIX: Ecco l'animazione di movimento (Hover)
        btn.onmouseover = () => btn.style.transform = 'translateX(5px)';
        btn.onmouseout = () => btn.style.transform = 'translateX(0)';
        
        btn.innerHTML = `
            <span style="font-weight: bold; color: var(--text-main);">${textObj.title}</span>
            <span style="background: ${colorCode}20; color: ${colorCode}; padding: 5px 12px; border-radius: 8px;">Inizia ➔</span>
        `;
        btn.onclick = () => window.openReadingPreview(textObj.id);
        listContainer.appendChild(btn);
    });
};

window.openReadingPreview = (id) => {
    currentReadingText = readingTexts.find(t => t.id === id);
    if (!currentReadingText) return;

    document.getElementById('preview-title').innerText = currentReadingText.title;
    document.getElementById('preview-level').innerText = currentReadingText.level;
    
    // Recupero progresso
    let progressIndex = (userData.readingProgress && userData.readingProgress[id]) ? userData.readingProgress[id] : 0;
    
    // --- LOGICA LIVELLO 3: CREAZIONE TAB ---
    if (currentReadingText.level === "Livello 3") {
        // Genera il selettore dei Tab
        let tabHTML = `
            <div style="display:flex; gap:5px; margin-bottom:15px; background:var(--bg-body); padding:5px; border-radius:12px; border:1px solid var(--border);">
                <button id="tab-jp-btn" onclick="switchPreviewTab('jp')" style="flex:1; padding:8px; border-radius:8px; border:none; background:var(--primary); color:white; font-weight:bold; cursor:pointer;">Giapponese</button>
                <button id="tab-it-btn" onclick="switchPreviewTab('it')" style="flex:1; padding:8px; border-radius:8px; border:none; background:transparent; color:var(--text-sub); font-weight:bold; cursor:pointer;">Traduzione</button>
            </div>
            <div id="tab-jp-content" style="max-height: 40vh; overflow-y: auto; padding-right: 5px; line-height: 1.6;"></div>
            <div id="tab-it-content" class="hidden" style="max-height: 40vh; overflow-y: auto; padding-right: 5px; line-height: 1.6;"></div>
        `;
        document.getElementById('preview-text-content').innerHTML = tabHTML;

        // Riempie il Tab Giapponese (Pulito)
        let rawJp = currentReadingText.fullText || currentReadingText.text;
        document.getElementById('tab-jp-content').innerHTML = rawJp.replace(/<span[^>]*>/g, '').replace(/<\/span>/g, '');

        // Riempie il Tab Traduzione (Sblocco progressivo)
        let itHTML = "";
        currentReadingText.segments.forEach((seg, index) => {
            if (index < progressIndex) {
                // Frase già tradotta
                itHTML += `<p style="margin-bottom:10px; color:var(--text-main); padding:8px; background:var(--primary)10; border-radius:8px;">${seg.it}</p>`;
            } else {
                // Frase ancora bloccata
                itHTML += `<p style="margin-bottom:10px; color:var(--text-sub); opacity:0.5; font-style:italic; padding:8px; border:1px dashed var(--border); border-radius:8px;"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Frase ${index + 1} ancora da sbloccare...</p>`;
            }
        });
        document.getElementById('tab-it-content').innerHTML = itHTML || "Inizia l'analisi per sbloccare la traduzione!";

    } else {
        // Logica standard per Livelli 1 e 2
        let rawText = currentReadingText.fullText || currentReadingText.text;
        document.getElementById('preview-text-content').innerHTML = rawText.replace(/<span[^>]*>/g, '').replace(/<\/span>/g, '');
    }

    // Gestione barra progresso e bottoni (rimane uguale a prima)
    let userProgress = 0;
    if (currentReadingText.segments) {
        userProgress = Math.round((progressIndex / currentReadingText.segments.length) * 100);
    } else {
        userProgress = (progressIndex === 1) ? 100 : 0;
    }

    document.getElementById('preview-progress-text').innerText = userProgress + "%";
    document.getElementById('preview-progress-bar').style.width = userProgress + "%";

    const btnStart = document.getElementById('btn-start-analysis');
    
    // Abilita il bottone per tutti i livelli (1, 2 e 3)
    btnStart.innerText = (userProgress > 0 && userProgress < 100) ? "Riprendi Analisi" : (userProgress === 100 ? "Ricomincia Analisi" : "Inizia Analisi");
    btnStart.style.background = (userProgress > 0 && userProgress < 100) ? "#D97706" : (userProgress === 100 ? "#10b981" : "#6366f1");
    btnStart.style.color = "white";
    btnStart.style.cursor = "pointer";
    btnStart.onclick = startAnalysisMode;

    showView('view-reading-preview');
};

// Funzione per cambiare Tab nell'anteprima
window.switchPreviewTab = (lang) => {
    const jpContent = document.getElementById('tab-jp-content');
    const itContent = document.getElementById('tab-it-content');
    const jpBtn = document.getElementById('tab-jp-btn');
    const itBtn = document.getElementById('tab-it-btn');

    if (lang === 'jp') {
        jpContent.classList.remove('hidden');
        itContent.classList.add('hidden');
        jpBtn.style.background = 'var(--primary)'; jpBtn.style.color = 'white';
        itBtn.style.background = 'transparent'; itBtn.style.color = 'var(--text-sub)';
    } else {
        itContent.classList.remove('hidden');
        jpContent.classList.add('hidden');
        itBtn.style.background = 'var(--primary)'; itBtn.style.color = 'white';
        jpBtn.style.background = 'transparent'; jpBtn.style.color = 'var(--text-sub)';
    }
};

let currentSegmentIndex = 0;

window.startAnalysisMode = () => {

    if (localStorage.getItem('hideKeyboardTutorial') !== 'true') {
        document.getElementById('keyboard-tutorial-modal').classList.remove('hidden');
    }
    
    // NUOVO CONTROLLO INSERITO QUI
    if (localStorage.getItem('hideReadingTutorial') !== 'true') {
        document.getElementById('reading-tutorial-modal').classList.remove('hidden');
    }

    if (!currentReadingText) return;
    
    if (currentReadingText.segments) {
        // Avvia il motore del Livello 2
        currentSegmentIndex = 0;
        
        // Se c'è un salvataggio, riprendi da lì
        if (userData && userData.readingProgress && userData.readingProgress[currentReadingText.id]) {
            currentSegmentIndex = userData.readingProgress[currentReadingText.id];
        }
        
        // Se l'aveva già finito al 100%, ricomincia da capo
        if (currentSegmentIndex >= currentReadingText.segments.length) {
            currentSegmentIndex = 0;
        }
        
        loadSegment(); 
    } else {
        // Logica per il Livello 1 (testo intero)
        window.startReadingMode(currentReadingText.id);
    }
};

window.loadSegment = () => {
    const seg = currentReadingText.segments[currentSegmentIndex];
    window._readingNoPressed = false;

    // Scrive il titolo e il numero della frase
    document.getElementById('read-title').innerText = currentReadingText.title;
    document.getElementById('read-level').innerText = "Frase " + (currentSegmentIndex + 1) + " di " + currentReadingText.segments.length;

    // Mostra il giapponese da leggere
    document.getElementById('reading-display').innerHTML = seg.jp;

    // Prepara e resetta le tre Fasi
    const ri = document.getElementById('reading-input');
    ri.value = "";
    ri.style.height = 'auto';
    document.getElementById('user-translation-input').value = ""; // Pulisce la tua traduzione
    document.getElementById('phase-reading').classList.remove('hidden');
    document.getElementById('phase-translation-input').classList.add('hidden');
    document.getElementById('translation-eval').classList.add('hidden');
    
    // Aggiorna le barre di progresso in alto
    let progress = Math.round((currentSegmentIndex / currentReadingText.segments.length) * 100);
    document.getElementById('prog-lettura').style.width = progress + "%";
    document.getElementById('prog-traduzione').style.width = progress + "%";
    
    showView('view-reading-mode');
    window.checkSectionTutorial?.('reading');
};


window.openBook = (bookId, colorCode) => {
    const book = booksData.find(b => b.id === bookId);
    if(!book) return;

    // Cambia il titolo in alto col nome del Libro
    const titleEl = document.getElementById('selected-level-title');
    titleEl.innerText = book.title; 

    const listContainer = document.getElementById('reading-list-dynamic');
    listContainer.innerHTML = ''; 
    
    // Layout a lista per i Capitoli (Niente immagini, display block)
    listContainer.style.display = 'block';

    book.chapters.forEach((chap, index) => {
        const btn = document.createElement('div');
        btn.className = "reading-item-card";
        btn.style = `display:flex; justify-content:space-between; align-items:center; padding:15px 20px; border:1px solid var(--border); border-radius:12px; background:var(--bg-body); margin-bottom:10px; transition:0.2s;`;
        
        if (chap.locked) {
            // Stile per capitoli bloccati (se in futuro vorrai usarli)
            btn.style.opacity = '0.6';
            btn.style.cursor = 'not-allowed';
            btn.innerHTML = `
                <span style="font-weight: bold; color: var(--text-main);"><span style="color:var(--text-sub); margin-right:8px;">Cap. ${index + 1}</span> ${chap.title}</span>
                <span style="font-size:1.2rem;"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>
            `;
        } else {
            // Stile per capitoli sbloccati
            btn.style.cursor = 'pointer';
            btn.onmouseover = () => btn.style.transform = 'translateX(5px)';
            btn.onmouseout = () => btn.style.transform = 'translateX(0)';
            btn.onclick = () => window.openReadingPreview(chap.id);
            btn.innerHTML = `
                <span style="font-weight: bold; color: var(--text-main);"><span style="color:var(--primary); margin-right:8px;">Cap. ${index + 1}</span> ${chap.title}</span>
                <span style="background: ${colorCode}20; color: ${colorCode}; padding: 5px 12px; border-radius: 8px;">Leggi ➔</span>
            `;
        }
        listContainer.appendChild(btn);
    });
    
    // Flag per ricordarci che siamo dentro ai capitoli di un libro
    window.currentViewingBook = true; 
};

// Sostituisci la tua vecchia backToLevels con questa "intelligente"
window.backToLevels = () => {
    if (window.currentViewingBook) {
        // Se eravamo dentro i capitoli, il tasto indietro ci riporta alla griglia dei libri
        window.currentViewingBook = false;
        window.openLevel('Livello 3', '#8b5cf6');
    } else {
        // Comportamento normale: torna alla selezione Livelli (1, 2 e 3)
        document.getElementById('text-selection-container').style.display = 'none';
        document.getElementById('level-selection-container').style.display = 'block';
    }
};

    

// --- GESTIONE DARK MODE ---
    const ICON_MOON = '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
    const ICON_SUN = '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
    window.toggleTheme = () => {
        const body = document.body;
        const icon = document.getElementById('theme-icon');

        // Se è dark, diventa light
        if (body.getAttribute('data-theme') === 'dark') {
            body.removeAttribute('data-theme');
            icon.innerHTML = ICON_MOON; // Torna la luna (per indicare che puoi mettere notte)
            localStorage.setItem('theme', 'light');
        } else {
            // Se è light, diventa dark
            body.setAttribute('data-theme', 'dark');
            icon.innerHTML = ICON_SUN; // Esce il sole (per indicare che puoi mettere giorno)
            localStorage.setItem('theme', 'dark');
        }
    };


    // --- CARICAMENTO PREFERENZA SALVATA ---
    // Questo codice parte subito all'avvio
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        // Se l'elemento esiste già (raro all'avvio immediato) lo cambia, 
        // altrimenti ci penserà l'HTML statico ad avere l'icona default, 
        // qui forziamo l'aggiornamento appena il DOM è pronto:
        setTimeout(() => {
            const icon = document.getElementById('theme-icon');
            if(icon) icon.innerHTML = ICON_SUN;
        }, 100);
    }

    let currentUser = null;
    let userData = { learned: [], friends: [], username: 'User', avatar:'👤', banner:'linear-gradient(to right, #4F46E5, #818CF8)' };
    const avatars = ['🦊','🐼','🐸','🦁','🐯','🐙','🦄','🐲','👾','🤖','💀','👽'];

    // Getter esportati: permettono ai moduli estratti (es. customDecks.js) di leggere
    // sempre il valore più recente di currentUser/userData, che vengono riassegnati in onAuthStateChanged.
    export function getCurrentUser() { return currentUser; }
    export function getUserData() { return userData; }

    // --- AUTH ---
    window.toggleAuthMode = (m) => { document.getElementById('form-login').classList.toggle('hidden', m==='register'); document.getElementById('form-register').classList.toggle('hidden', m!=='register'); };
    window.performLogin = async () => { try { await signInWithEmailAndPassword(auth, document.getElementById('log-email').value, document.getElementById('log-password').value); } catch(e) { alert("Errore: "+e.code); } };
    window.performRegister = async () => { const n=document.getElementById('reg-name').value; try { const c=await createUserWithEmailAndPassword(auth, document.getElementById('reg-email').value, document.getElementById('reg-password').value); await setDoc(doc(db,"users",c.user.uid), { username:n, email:c.user.email, friendCode: n.substring(0,3).toUpperCase()+"#"+Math.floor(1000+Math.random()*9000), learned:[], friends:[], avatar:'👤', banner:'linear-gradient(to right, #4F46E5, #818CF8)' }); } catch(e) { alert("Errore: "+e.message); } };
    window.logout = () => signOut(auth);

    onAuthStateChanged(auth, async (u) => {
        if(u) {
            currentUser = u;
            document.getElementById('view-auth').classList.add('hidden');
            document.getElementById('app-main').classList.remove('hidden');
            const snap = await getDoc(doc(db,"users",u.uid));
            if(snap.exists()) { 
                userData = snap.data(); 
                
                // Inizializza array vuoti se mancano nel database per evitare errori
               if(!userData.readingProgress) userData.readingProgress = {};
                if(!userData.learned) userData.learned=[]; 
                if(!userData.friends) userData.friends=[];
                if(!userData.errors) userData.errors=[]; // <--- IMPORTANTE PER GLI ERRORI
                if(!userData.knownKanji) userData.knownKanji=[];
                if(!userData.seenTutorials) userData.seenTutorials={};

                // --- SINCRONIZZAZIONE MAZZI PERSONALIZZATI (FAI DA TE) CON FIRESTORE ---
                if(userData.customDecks) {
                    // Il cloud ha già dei mazzi salvati: diventa la fonte di verità
                    customDecks.length = 0;
                    userData.customDecks.forEach(d => customDecks.push(d));
                    localStorage.setItem('jap_custom_decks', JSON.stringify(customDecks));
                } else if(customDecks.length > 0) {
                    // Migrazione: l'utente ha mazzi salvati solo in locale da prima della sincronizzazione cloud
                    userData.customDecks = customDecks;
                    updateDoc(doc(db,"users",u.uid), {customDecks: customDecks}).catch(console.error);
                }

                if(!userData.avatar) userData.avatar='👤';
                if(!userData.banner) userData.banner='linear-gradient(to right, #4F46E5, #818CF8)';
                
                document.getElementById('my-code-display').innerText=userData.friendCode;
                
                // --- AVVIA TUTTE LE GRAFICHE ---
                updateStatsUI(); 
                window.listenForGlobalNotifications(); 
                renderHomeLeaderboard(); 
                
                // --- LE NUOVE FUNZIONI (Queste mancavano!) ---
                window.updateErrorUI();   // Controlla se mostrare il tasto rosso
                window.renderDailyWord?.();

                _checkScheduledNotifOnLoad?.();

                // Ripristina l'ultima view visitata dopo un refresh
                const _lastView = sessionStorage.getItem('lastView');
                if (_lastView && _lastView !== 'view-home' && _lastView !== 'view-auth') {
                    const _viewRedirects = {
                        'view-quiz': 'view-home',
                        'view-result': 'view-home',
                        'view-verb-quiz': 'view-verb-setup',
                        'view-adj-quiz': 'view-adj-setup',
                        'view-particle-quiz': 'view-particle-setup',
                        'view-reading-mode': 'view-reading-select',
                        'view-reading-preview': 'view-reading-select',
                        'view-reading-result': 'view-reading-select',
                        'view-friend-detail': 'view-home',
                        'view-kanji-select': 'view-home',
                        'view-social': 'view-home',
                    };
                    setTimeout(() => {
                        if (_lastView === 'view-selection') {
                            const _ctx = JSON.parse(sessionStorage.getItem('lastSelectionCtx') || 'null');
                            if (_ctx?.type === 'kanji' && _ctx?.cats?.length > 0) {
                                window.tempSelectedKanjiCats = _ctx.cats;
                                window.confermaKanjiMulti(true);
                            } else if (_ctx?.type === 'kana' && _ctx?.cats?.length > 0) {
                                window.tempSelectedKanaCats = _ctx.cats;
                                window.confermaKanaMulti(true);
                            } else {
                                showView('view-home');
                            }
                        } else if (_lastView === 'view-custom-decks') {
                            showView('view-custom-decks');
                            window.renderCustomDecks?.();
                        } else {
                            const _target = _viewRedirects[_lastView] ?? _lastView;
                            showView(_target);
                        }
                    }, 300);
                }

                // Mostra tutorial alla prima apertura (se non già visto)
                if (!userData.tutorialSeen) {
                    setTimeout(() => window._startTutorial?.(), 700);
                }
            }
        } else {
            document.getElementById('view-auth').classList.remove('hidden');
            document.getElementById('app-main').classList.add('hidden');
        }
    });

    // --- EDIT PROFILE & BANNER FIX ---
    // --- 1. APERTURA MODIFICA (Setup corretto) ---
    window.openEditProfile = () => {
        const modal = document.getElementById('modal-edit-profile');
        modal.classList.remove('hidden');
        
        document.getElementById('edit-bio').value = userData.bio || "";
        
        // Reset variabili temporanee con i valori attuali
        userData.tempAvatar = userData.avatar;
        userData.tempBanner = userData.banner;

        // Gestione Avatar
        const avGrid = document.getElementById('avatar-selector');
        avGrid.innerHTML = '';
        avatars.forEach(av => {
            const div = document.createElement('div');
            div.className = 'avatar-option ' + (userData.avatar === av ? 'selected' : '');
            div.innerText = av;
            div.onclick = function() { 
                document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected')); 
                this.classList.add('selected'); 
                userData.tempAvatar = av; 
            };
            avGrid.appendChild(div);
        });

        // Gestione Colori (FIX)
        const colorOpts = document.querySelectorAll('.color-option');
        colorOpts.forEach(el => {
            el.classList.remove('selected');
            // Se questo è il colore attuale, evidenzialo
            if (el.getAttribute('data-color') === userData.banner) {
                el.classList.add('selected');
            }
            
            el.onclick = function() { 
                colorOpts.forEach(c => c.classList.remove('selected')); 
                this.classList.add('selected'); 
                // Prende il valore dall'attributo HTML data-color
                userData.tempBanner = this.getAttribute('data-color'); 
            }; 
        });
    };

    // --- 2. SALVATAGGIO (Aggiorna SUBITO la grafica) ---
    window.saveProfileChanges = async () => {
        const bio = document.getElementById('edit-bio').value;
        const newAv = userData.tempAvatar || userData.avatar;
        const newBan = userData.tempBanner || userData.banner;
        
        // 1. Aggiorna Database
        await updateDoc(doc(db, "users", currentUser.uid), { bio: bio, avatar: newAv, banner: newBan });
        
        // 2. Aggiorna Dati Locali
        userData.bio = bio; 
        userData.avatar = newAv; 
        userData.banner = newBan;
        
        // 3. APPLICA VISIVAMENTE SUBITO (Senza ricaricare)
        document.getElementById('prof-bio').innerText = bio;
        document.getElementById('prof-avatar').innerText = newAv;
        const bannerEl = document.getElementById('prof-banner');
        if(bannerEl) bannerEl.style.background = newBan;
        
        // Chiudi
        document.getElementById('modal-edit-profile').classList.add('hidden');
    };

    // --- UI HELPERS ---
    window.goHome = () => { _navStack = []; showView('view-home'); };
    window.goBack = () => {
        if (_navStack.length > 1) {
            _navStack.pop();
            const _prev = _navStack[_navStack.length - 1];
            _isGoingBack = true;
            showView(_prev);
        } else {
            _navStack = [];
            showView('view-home');
        }
    };
    window.showProfile = () => { 
        showView('view-profile'); 
        updateStatsUI(); 
        
        // Resetta la griglia (tutto chiuso all'avvio)
        window.myCurrentGrid = null;
        document.getElementById('my-inventory-grid').innerHTML = '';
        if(document.getElementById('my-sb-kanji')) document.getElementById('my-sb-kanji').style.border = '1px solid var(--border)';
        if(document.getElementById('my-sb-kana')) document.getElementById('my-sb-kana').style.border = '1px solid var(--border)';

        loadMyPosts(); // Carica la tua bacheca
    };
    window.showSocial = () => { showView('view-social'); renderFriends(); };
    window.toggleMenu = () => document.getElementById('dropdown-menu').classList.toggle('show');
    window.closeMenuOutside = (e) => { if(!e.target.closest('.menu-wrapper')) document.getElementById('dropdown-menu').classList.remove('show'); };
    window.showTutorials = () => showView('view-tutorials');
    window.openKeyboardTutorial = () => document.getElementById('keyboard-tutorial-modal').classList.remove('hidden');

    
    // --- SEARCH BAR ---
    window.handleSearch = (e) => {
        if (e.key === 'Enter') {
            const val = e.target.value.toLowerCase().trim();
            if (!val) return;
            if (val.includes('kanji')) { openModeSelector('kanji'); }
            else if (val.includes('kana') || val.includes('hira')) { openModeSelector('kana'); }
            else if (val.includes('vocab') || val.includes('parol')) { openModeSelector('vocab'); }
            else if (val.includes('gramm') || val.includes('verbi')) { showTheory(); }
            else if (val.includes('amic') || val.includes('classifica')) { showSocial(); }
            else if (val.includes('gloss')) { showList('n5'); }
            else if (val.includes('prof')) { showProfile(); }
            else { alert("Provo nel glossario: " + val); showList('n5'); }
            e.target.value = '';
        }
    };

    // --- POPUP MODALITÀ (Aggiornato con Classificatori) ---
    window.openModeSelector = (category) => {
        const modal = document.getElementById('modal-mode-selector');
        const title = document.getElementById('mode-title');
        const desc = document.getElementById('mode-desc');
        const icon = document.getElementById('mode-icon');
        const container = document.getElementById('mode-options');
        
        container.innerHTML = '';
        modal.classList.remove('hidden');

        // Helper per creare bottoni
        const createBtn = (mainText, subText, onClick, color) => {
            const btn = document.createElement('button');
            btn.innerHTML = `<div style="font-size:1.1rem; font-weight:800;">${mainText}</div><div style="font-size:0.85rem; opacity:0.8; font-weight:500;">${subText}</div>`;
            btn.onclick = onClick; // L'azione viene passata qui
            btn.style = `padding: 16px; border-radius: 14px; border: 1px solid var(--border); background: var(--bg-body); color: var(--text-main); cursor: pointer; width: 100%; text-align: left; display: flex; justify-content: space-between; align-items: center; transition: 0.2s; margin-bottom:10px;`;
            
            const arrow = document.createElement('span'); arrow.innerHTML = '➔'; arrow.style.opacity = '0.5';
            btn.appendChild(arrow);

            btn.onmouseover = () => { btn.style.background = color; btn.style.color = 'white'; btn.style.borderColor = color; arrow.style.color = 'white'; arrow.style.opacity = '1'; };
            btn.onmouseout = () => { btn.style.background = 'var(--bg-body)'; btn.style.color = 'var(--text-main)'; btn.style.borderColor = 'var(--border)'; arrow.style.color = 'var(--text-main)'; arrow.style.opacity = '0.5'; };
            container.appendChild(btn);
        };

        if (category === 'kanji') {
            icon.innerText = '字'; title.innerText = 'Kanji'; desc.innerText = 'Seleziona esercizio';
            createBtn('Lettura', 'Kanji → Hiragana', () => { modal.classList.add('hidden'); setup('kanji', 'lettura'); }, '#E11D48');
            createBtn('Significato', 'Kanji → Italiano', () => { modal.classList.add('hidden'); setup('kanji', 'significato'); }, '#E11D48');
        } else if (category === 'kana') {
            icon.innerText = 'あ'; title.innerText = 'Kana'; desc.innerText = 'Seleziona alfabeti';
            
            createBtn('Mix Kana', 'Hiragana e Katakana', () => { modal.classList.add('hidden'); window.openModernKanaSelector(); }, '#D97706');
            
        } else if (category === 'vocab') {
            icon.innerText = '語'; title.innerText = 'Vocaboli'; desc.innerText = 'Direzione traduzione';
            createBtn('Scrittura', 'Giapponese → Hiragana', () => { modal.classList.add('hidden'); setup('vocab', 'lettura'); }, '#059669');
            createBtn('Traduzione', 'Giapponese → Italiano', () => { modal.classList.add('hidden'); setup('vocab', 'significato'); }, '#059669');
        } else if (category === 'grammar') {
            icon.innerText = '文'; title.innerText = 'Grammatica'; desc.innerText = 'Scegli argomento';
            
            createBtn('Verbi', 'Tutte le forme e coniugazioni', () => { modal.classList.add('hidden'); openVerbSetup(); }, '#7C3AED');
            createBtn('Aggettivi', 'Gruppi い e な, tutte le forme', () => { modal.classList.add('hidden'); openAdjSetup(); }, '#7C3AED');
            createBtn('Classificatori', 'Persone, Cose, Tempo...', () => { modal.classList.add('hidden'); window.openModernCounterSelector(); }, '#7C3AED');
            createBtn('Particelle', 'Mettiti alla prova', () => { modal.classList.add('hidden'); window.openParticleSetup(); }, '#7C3AED');
        }
    };      
    // GLOSSARIO
    window.showList = (type) => { showView('view-list'); renderList(type); };
    
    // --- GLOSSARIO RENDER ---
    window.renderList = (type) => {
        // 1. Aggiorna stile Tabs
        ['n5','n4','n3','n2','n1','h','kt'].forEach(t => {
            const el = document.getElementById('tab-'+t);
            if(el) el.className = 'inv-tab';
        });
        const activeTab = document.getElementById('tab-'+type);
        if(activeTab) activeTab.className = 'inv-tab active';
        const searchEl = document.getElementById('glossary-search');
        if (searchEl) searchEl.value = '';

        // 2. Seleziona i Dati
        let dbList = [];
        if(type==='n5') dbList=n5Kanji;
        else if(type==='n4') dbList=n4Kanji;
        else if(type==='n3') dbList=n3Kanji;
        else if(type==='n2') dbList=n2Kanji;
        else if(type==='n1') dbList=n1Kanji;
        else if(type==='hiragana') dbList=hiraData;
        else if(type==='katakana') dbList=kataData;

        const c = document.getElementById('list-container'); 
        c.innerHTML='';
        
        // 3. Genera le Card
        dbList.forEach(i => {
            const div = document.createElement('div');
            // Controlla se è imparato
            const isLearned = userData.learned ? userData.learned.includes(i.k) : false;
            
            div.className = 'list-item ' + (isLearned ? 'learned' : '');
            div.dataset.k = i.k.toLowerCase();
            div.dataset.r = (i.r || '').toLowerCase();
            div.dataset.s = (i.s || '').toLowerCase();

            // Fuga delle virgolette singole (previene errori se nel testo ci sono apostrofi)
            const safeK = i.k.replace(/'/g, "\\'");
            const safeR = i.r.replace(/'/g, "\\'");
            const safeS = i.s.replace(/'/g, "\\'");
            
            // HTML Pulito della Card con il NUOVO BOTTONE "+"
            div.innerHTML = `
                <div class="item-main">
                    <div class="item-char">${i.k}</div>
                    <div class="item-info">
                        <div class="item-reading">${i.r}</div>
                        <div class="item-meaning">${i.s}</div>
                        ${isLearned ? '<div style="font-size:0.68rem; color:#10b981; font-weight:800; margin-top:4px; letter-spacing:0.04em;">✓ APPRESO</div>' : ''}
                    </div>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <div onclick="window.preparaAggiuntaMazzo('${safeK}', '${safeR}', '${safeS}')" 
                         title="Aggiungi al Mazzo"
                         style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid var(--primary); display: flex; justify-content: center; align-items: center; color: var(--primary); cursor: pointer; transition: 0.2s;"
                         onmouseover="this.style.background='var(--primary)'; this.style.color='white';"
                         onmouseout="this.style.background='transparent'; this.style.color='var(--primary)';">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </div>
                    <div class="check-circle" onclick="toggleLearnList('${safeK}', this.closest('.list-item'))">
                        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                </div>
            `;
            c.appendChild(div);
        });
    };

    window.filterGlossList = (query) => {
        const q = query.trim().toLowerCase();
        document.querySelectorAll('#list-container .list-item').forEach(item => {
            const match = !q || item.dataset.k.includes(q) || item.dataset.r.includes(q) || item.dataset.s.includes(q);
            item.style.display = match ? '' : 'none';
        });
    };

    // Funzione helper per preparare i dati e aprire il popup
    window.preparaAggiuntaMazzo = (k, r, s) => {
        window.currentVocabToAdd = { k: k, r: r, s: s };
        window.openAddToDeckModal();
    };

    window.toggleLearnList = async (char, el) => {
        if(userData.learned.includes(char)) { userData.learned = userData.learned.filter(c => c !== char); el.classList.remove('learned'); } else { userData.learned.push(char); el.classList.add('learned'); }
        await updateDoc(doc(db, "users", currentUser.uid), { learned: userData.learned });
        updateStatsUI();
    };

   window.showView = function showView(id) {
        // Chiudi qualsiasi tutorial aperto prima di cambiare vista
        const _ov = document.getElementById('tutorial-overlay');
        if (_ov && !_ov.classList.contains('hidden')) {
            if (typeof window._sectionTutClose === 'function') window._sectionTutClose();
            else _ov.classList.add('hidden');
        }
        // Lista completa di TUTTE le sezioni del tuo sito (Aggiornata con le particelle!)
        const views = [
            'view-home', 'view-selection', 'view-quiz', 'view-result',
            'view-profile', 'view-social', 'view-list', 'view-friend-detail',
            'view-inventory', 'view-theory', 'view-kanji-select', 'view-verb-setup',
            'view-reading-select', 'view-verb-quiz', 'view-reading-mode', 'view-reading-result',
            'view-reading-preview', 'view-tutorials', 'view-custom-decks', 'view-adj-setup',
            'view-adj-quiz', 'view-particle-setup', 'view-particle-quiz', 'view-community',
            'view-kanji-theory', 'view-learn-levels'];

        views.forEach(v => { 
            const el = document.getElementById(v); 
            if(el) {
                el.classList.add('hidden');
                el.style.display = 'none'; // Forza la scomparsa
                el.classList.remove('view-animate');
            }
        }); 
        
        const activeEl = document.getElementById(id);
        if (activeEl) {
            activeEl.classList.remove('hidden');
            activeEl.style.display = 'block'; 
            void activeEl.offsetWidth; 
            activeEl.classList.add('view-animate');
        } else {
            console.error("ERRORE: La vista con ID '" + id + "' non esiste nell'HTML!");
        }
        
        document.getElementById('dropdown-menu').classList.remove('show');

        // ECCO LA MAGIA: Riporta sempre la visuale all'inizio della pagina!
        window.scrollTo(0, 0);

        if (!_isGoingBack) {
            if (_navStack.length === 0 || _navStack[_navStack.length - 1] !== id) {
                _navStack.push(id);
            }
        }
        _isGoingBack = false;

        sessionStorage.setItem('lastView', id);
    };

    // --- INVENTARIO CON SALVATAGGIO MANUALE ---
    let invDB = [];
    let tempLearned = []; // Array temporaneo per le modifiche non salvate

    window.showInventory = (type) => {
        showView('view-inventory');
        document.getElementById('inv-title').innerText = "Inventario " + type;
        
        // Seleziona il DB corretto
        if(type==='kanji') invDB=kanjiData; 
        else if(type==='hiragana') invDB=hiraData; 
        else if(type==='katakana') invDB=kataData;
        
        // 1. CREA UNA COPIA TEMPORANEA dei dati attuali
        // Usiamo lo spread operator [...] per non modificare subito l'originale
        tempLearned = [...userData.learned];

        const container = document.getElementById('inventory-container'); 
        container.innerHTML = '';
        
        invDB.forEach(item => {
            const el = document.createElement('div');
            // Controlla se è presente nella copia temporanea
            const isLearned = tempLearned.includes(item.k);
            
            el.className = 'inv-card ' + (isLearned ? 'active' : '');
            el.innerText = item.k;
            
            // Passiamo l'elemento DOM alla funzione toggle
            el.onclick = () => toggleLearnInv(item.k, el);
            container.appendChild(el);
        });
    };

    // Modifica SOLO visivamente e nell'array temporaneo
    window.toggleLearnInv = (char, el) => {
        if(tempLearned.includes(char)) { 
            // Rimuovi dalla temp
            tempLearned = tempLearned.filter(c => c !== char); 
            el.classList.remove('active'); 
        } else { 
            // Aggiungi alla temp
            tempLearned.push(char); 
            el.classList.add('active'); 
        }
        // NOTA: Nessuna chiamata al DB qui!
    };

    // Salva tutto in un colpo solo
    window.saveInventoryChanges = async () => {
        const btn = document.querySelector('.btn-fab');
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Salvataggio...'; // Feedback visivo
        
        try {
            // Aggiorna DB
            await updateDoc(doc(db, "users", currentUser.uid), { learned: tempLearned });
            
            // Aggiorna Dati Locali Reali
            userData.learned = [...tempLearned];
            
            // Aggiorna Statistiche Profilo
            updateStatsUI();
            
            // Feedback successo
            btn.style.background = "#059669"; // Verde
            btn.innerHTML = "Salvato! ✓";
            
            setTimeout(() => {
                showProfile(); // Torna al profilo dopo 1 secondo
                // Reset stile bottone
                setTimeout(() => { 
                    btn.style.background = "var(--text-main)"; 
                    btn.innerHTML = originalText;
                }, 500);
            }, 800);
            
        } catch(e) {
            console.error(e);
            alert("Errore nel salvataggio. Controlla la connessione.");
            btn.innerHTML = originalText;
        }
    };

    function updateStatsUI() {
        document.getElementById('prof-name').innerText = userData.username;
        document.getElementById('prof-handle').innerText = "@" + userData.friendCode;
        document.getElementById('prof-bio').innerText = userData.bio || "Nessuna biografia.";
        document.getElementById('prof-avatar').innerText = userData.avatar;
        
        const bannerEl = document.getElementById('prof-banner');
        if(bannerEl) bannerEl.style.background = userData.banner || 'linear-gradient(to right, #4F46E5, #818CF8)';

        const count = (arr) => arr.filter(i => userData.learned.includes(i.k)).length;
        // TOLTI I VOCABOLI DA QUI
        const k = count(kanjiData); const h = count(hiraData) + count(kataData);
        
        // Livello e XP gestiti dal nuovo sistema (window.updateProfileXP)
        const totalLearned = userData.learned.length;

        // TOLTI I VOCABOLI DAL TOTALE
        const tot = Math.round((userData.learned.length / (kanjiData.length+hiraData.length+kataData.length))*100);
        document.getElementById('stat-kanji').innerText = k;
        document.getElementById('stat-kana').innerText = h;
        document.getElementById('stat-total').innerText = tot + "%";

        window.updateProfileXP?.();
        window.renderAchievements();
        window._loadNotifUI?.();
    }

    // --- ACHIEVEMENT ---
    const _achievements = [
        { id:'first_step',  icon:'🌱', label:'Primo passo',       desc:'Apprendi il tuo primo kanji o kana',           check: l => l.length >= 1 },
        { id:'hira_start',  icon:'あ', label:'Hiragana Studente', desc:'Apprendi 20 hiragana',                         check: l => hiraData.filter(i=>l.includes(i.k)).length >= 20 },
        { id:'hira_master', icon:'あ✨',label:'Hiragana Maestro', desc:'Apprendi tutti gli hiragana',                  check: l => hiraData.every(i=>l.includes(i.k)) },
        { id:'kata_master', icon:'ア✨',label:'Katakana Maestro', desc:'Apprendi tutti i katakana',                   check: l => kataData.every(i=>l.includes(i.k)) },
        { id:'kana_master', icon:'🔤', label:'Maestro Kana',      desc:'Apprendi tutti hiragana e katakana',           check: l => [...hiraData,...kataData].every(i=>l.includes(i.k)) },
        { id:'n5_start',    icon:'📖', label:'N5 Studente',       desc:'Apprendi 10 kanji N5',                         check: l => n5Kanji.filter(i=>l.includes(i.k)).length >= 10 },
        { id:'n5_half',     icon:'📗', label:'N5 Metà Strada',    desc:'Apprendi metà dei kanji N5',                   check: l => n5Kanji.filter(i=>l.includes(i.k)).length >= Math.floor(n5Kanji.length/2) },
        { id:'n5_master',   icon:'🏅', label:'N5 Completo',       desc:'Apprendi tutti i kanji N5',                    check: l => n5Kanji.every(i=>l.includes(i.k)) },
        { id:'n4_start',    icon:'📘', label:'N4 Studente',       desc:'Apprendi 10 kanji N4',                         check: l => n4Kanji.filter(i=>l.includes(i.k)).length >= 10 },
        { id:'n4_master',   icon:'🥈', label:'N4 Completo',       desc:'Apprendi tutti i kanji N4',                    check: l => n4Kanji.every(i=>l.includes(i.k)) },
        { id:'century',     icon:'💯', label:'Centenario',         desc:'Apprendi 100 elementi in totale',              check: l => l.length >= 100 },
        { id:'double',      icon:'🔥', label:'Duecentista',        desc:'Apprendi 200 elementi in totale',              check: l => l.length >= 200 },
        { id:'triple',      icon:'⚡', label:'Trecentista',        desc:'Apprendi 300 elementi in totale',              check: l => l.length >= 300 },
        { id:'n3_start',    icon:'📙', label:'N3 Studente',       desc:'Apprendi 10 kanji N3',                         check: l => n3Kanji.filter(i=>l.includes(i.k)).length >= 10 },
        { id:'all_rounder', icon:'🌟', label:'Poliedrico',         desc:'Completa N5 e tutti i kana',                   check: l => n5Kanji.every(i=>l.includes(i.k)) && [...hiraData,...kataData].every(i=>l.includes(i.k)) },
    ];

    window.toggleAchievementsWidget = () => {
        const body = document.getElementById('achievements-widget-body');
        const arrow = document.getElementById('achievements-toggle-arrow');
        if (!body) return;
        const isOpen = body.style.maxHeight !== '0px' && body.style.maxHeight !== '';
        body.style.maxHeight = isOpen ? '0px' : '1000px';
        if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
    };

    window.renderAchievements = () => {
        const grid = document.getElementById('achievements-grid');
        const sub = document.getElementById('achievements-widget-sub');
        if (!grid) return;
        const learned = userData.learned || [];
        const unlockedCount = _achievements.filter(a => a.check(learned)).length;
        if (sub) sub.textContent = `${unlockedCount} / ${_achievements.length} sbloccati`;
        grid.innerHTML = '';
        _achievements.forEach(a => {
            const ok = a.check(learned);
            const el = document.createElement('div');
            el.style.cssText = `text-align:center; padding:12px 8px; background:${ok ? 'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(168,85,247,0.15))' : 'var(--bg-body)'}; border-radius:12px; border:1px solid ${ok ? 'rgba(99,102,241,0.4)' : 'var(--border)'}; opacity:${ok ? '1' : '0.4'};`;
            el.innerHTML = `<div style="font-size:1.6rem; line-height:1; margin-bottom:6px; filter:${ok ? 'none' : 'grayscale(1)'};">${a.icon}</div><div style="font-size:0.7rem; font-weight:800; color:${ok ? 'var(--text-main)' : 'var(--text-sub)'}; line-height:1.2; margin-bottom:4px;">${a.label}</div><div style="font-size:0.6rem; color:var(--text-sub); line-height:1.3;">${a.desc}</div>`;
            grid.appendChild(el);
        });
    };

    window.sendFriendRequest = async () => {
    const code = document.getElementById('friend-input').value.trim();
    if(code === userData.friendCode) return window.showToast("Non puoi aggiungerti da solo!", true);
    
    const qUser = query(collection(db, "users"), where("friendCode", "==", code));
    const snapUser = await getDocs(qUser);
    if(snapUser.empty) return window.showToast("Codice inesistente.", true);
    
    const targetId = snapUser.docs[0].id;
    if(userData.friends.includes(targetId)) return window.showToast("Siete già amici!", true);
    
    // Controlla nel nuovo DB Notifiche
    const qReq = query(collection(db, "notifications"), where("from", "==", currentUser.uid), where("to", "==", targetId), where("type", "==", "friend_request"));
    const snapReq = await getDocs(qReq);
    if(!snapReq.empty) return window.showToast("Hai già inviato una richiesta a questo utente!", true);
    
    await addDoc(collection(db, "notifications"), { 
        type: "friend_request",
        from: currentUser.uid, 
        fromName: userData.username, 
        fromAvatar: userData.avatar, 
        to: targetId, 
        status: "unread",
        createdAt: serverTimestamp()
    });
    window.showToast("Richiesta inviata!");
};

   // Variabile per salvare temporaneamente i dati dell'amico che stiamo guardando
    let currentFriendViewData = null;

    window.viewFriendProfile = async (fid) => {
    const snap = await getDoc(doc(db, "users", fid));
    if(!snap.exists()) return;
    
    const f = snap.data();
    currentFriendViewData = f;
    const learned = f.learned || [];

    document.getElementById('friend-name').innerText = f.username;
    document.getElementById('friend-bio').innerText = f.bio || "Nessuna biografia.";
    document.getElementById('friend-avatar').innerText = f.avatar || '👤';
    
    const ban = document.getElementById('friend-banner');
    ban.style.background = f.banner || 'linear-gradient(to right, #ccc, #ddd)';

    const k = kanjiData.filter(i=>learned.includes(i.k)).length;
    const h = hiraData.filter(i=>learned.includes(i.k)).length + kataData.filter(i=>learned.includes(i.k)).length;
    const total = kanjiData.length + hiraData.length + kataData.length;
    const totPct = Math.round((learned.length / total) * 100);

    document.getElementById('fd-kanji').innerText = k;
    document.getElementById('fd-kana').innerText = h;
    document.getElementById('fd-total').innerText = totPct + "%";

    showView('view-friend-detail');
    
    // Resetta la griglia dell'amico (chiusa all'avvio)
    window.friendCurrentGrid = null;
    document.getElementById('friend-grid').innerHTML = '';
    if(document.getElementById('sb-kanji')) document.getElementById('sb-kanji').style.border = '1px solid var(--border)';
    if(document.getElementById('sb-kana')) document.getElementById('sb-kana').style.border = '1px solid var(--border)';
    
    // --- GESTIONE BOTTONE AMICIZIA E CHAT SUL PROFILO ---
    const actionContainer = document.getElementById('friend-profile-actions');
    if (actionContainer) {
        actionContainer.style.display = "flex";
        actionContainer.style.justifyContent = "center";
        actionContainer.style.marginTop = "20px";

        if (fid === currentUser.uid) {
            actionContainer.innerHTML = ''; // È il tuo profilo
        } else if (userData.friends && userData.friends.includes(fid)) {
            // Siete amici -> Doppio tasto! Chatta + Gestione Amicizia
            actionContainer.innerHTML = `
                <div style="display:flex; gap:10px; width:100%; max-width:300px;">
                    <button onclick="openChat('${fid}', '${f.username.replace(/'/g, "\\'")}', '${f.avatar}')" style="flex:1; padding:10px; background:var(--primary); color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer; font-size:0.95rem; transition:0.2s; box-shadow: 0 4px 10px rgba(99, 102, 241, 0.3);"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> Chatta</button>
                    <button onclick="window.removeFriend('${fid}', 'questo utente', true)" style="flex:1; padding:10px; background:var(--bg-body); color:var(--text-main); border:1px solid var(--border); border-radius:10px; font-weight:bold; cursor:pointer; font-size:0.95rem; transition:0.2s; display:flex; justify-content:center; align-items:center; gap:5px;"><span>Amici</span> <span style="font-size:1.1rem; color:#10b981;">✓</span></button>
                </div>
            `;
        } else {
            // Non siete amici: prima mostra un caricamento temporaneo...
            actionContainer.innerHTML = `<div style="color:var(--text-sub); font-size:0.9rem;">Controllo stato...</div>`;

            // ...poi interroga il database per vedere se c'è una richiesta in sospeso
            const qReq = query(collection(db, "friendRequests"), where("from", "==", currentUser.uid), where("to", "==", fid));
            getDocs(qReq).then(snapReq => {
                if (!snapReq.empty) {
                    actionContainer.innerHTML = `<button style="width:100%; max-width:300px; padding:10px 20px; background:var(--bg-body); color:var(--text-main); border:1px solid var(--border); border-radius:10px; font-weight:bold; cursor:default; font-size:0.95rem;">Richiesta inviata</button>`;
                } else {
                    actionContainer.innerHTML = `<button onclick="sendFriendRequestProfile('${fid}', this)" style="width:100%; max-width:300px; padding:10px 20px; background:#3b82f6; color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer; font-size:0.95rem; transition:0.2s;">Aggiungi</button>`;
                }
            }).catch(e => console.error(e));
        }
    }

    // Resetta tendina post (chiusa all'apertura del profilo)
    const postsArrow = document.getElementById('friend-posts-arrow');
    const postsGridEl = document.getElementById('friend-posts-grid');
    if (postsGridEl) { postsGridEl.style.display = 'none'; }
    if (postsArrow) postsArrow.style.transform = '';

    // --- CARICA IL FEED DEI POST DELL'UTENTE (Stile Threads) ---
    const postsGrid = document.getElementById('friend-posts-grid');
    if (postsGrid) {
        postsGrid.innerHTML = '<div style="text-align:center; color:var(--text-sub); padding:20px;">Caricamento post...</div>';
        
        const qPosts = query(collection(db, "communityPosts"), where("authorId", "==", fid));
        
        getDocs(qPosts).then(snapPosts => {
            postsGrid.innerHTML = '';
            if (snapPosts.empty) {
                postsGrid.innerHTML = '<div style="text-align:center; color:var(--text-sub); padding:20px;">Nessun post pubblicato.</div>';
                return;
            }
            
            let userPosts = [];
            snapPosts.forEach(doc => { let p = doc.data(); p.id = doc.id; userPosts.push(p); });
            
            // FIX: Ordinamento sicuro che non crasha se manca la data!
            userPosts.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            
            userPosts.forEach(post => {
                const postId = post.id;
                const likesCount = post.likes ? post.likes.length : 0;
                const isLiked = post.likes && post.likes.includes(currentUser.uid);

                const postDiv = document.createElement('div');
                postDiv.style = "background:var(--bg-body); border-radius:15px; padding:20px; border:1px solid var(--border); text-align: left;";
                
                postDiv.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
                        <div style="font-size:2rem; background:var(--bg-card); width:45px; height:45px; display:flex; justify-content:center; align-items:center; border-radius:50%; box-shadow:0 2px 10px rgba(0,0,0,0.1);">${post.authorAvatar || '👤'}</div>
                        <div>
                            <div style="font-weight:bold; color:var(--text-main); font-size:1rem;">${post.authorName}</div>
                            <div style="font-size:0.75rem; color:var(--text-sub);">${post.createdAt ? new Date(post.createdAt.toDate()).toLocaleDateString('it-IT', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : 'Ora'}</div>
                        </div>
                    </div>
                    
                    ${post.imageUrl ? `<div style="margin-bottom:15px; border-radius:12px; overflow:hidden; border:1px solid var(--border); background:var(--bg-card);"><img src="${post.imageUrl}" onclick="openImageView('${post.imageUrl}', event)" style="width:100%; max-height:400px; object-fit:cover; display:block; cursor:pointer; transition:0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'"></div>` : ''}
                    
                    <div onclick="openPostDetail('${postId}')" style="color:var(--text-main); font-size:1.05rem; line-height:1.5; margin-bottom:20px; white-space:pre-wrap; cursor:pointer;">${post.content}</div>
                    
                    <div style="display:flex; gap:15px; border-top:1px solid var(--border); padding-top:15px;">
                        <button onclick="toggleLike('${postId}', ${isLiked})" style="background:${isLiked ? '#FEE2E2' : 'var(--bg-card)'}; color:${isLiked ? '#ef4444' : 'var(--text-sub)'}; border:1px solid ${isLiked ? '#ef4444' : 'var(--border)'}; padding:8px 15px; border-radius:50px; cursor:pointer; font-weight:bold; transition:0.2s; display:flex; align-items:center; gap:5px;">
                            ${isLiked ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="#ef4444" stroke-width="2" fill="#ef4444"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>' : '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>'} ${likesCount}
                        </button>
                        <button onclick="openPostDetail('${postId}')" style="background:var(--bg-card); color:var(--text-sub); border:1px solid var(--border); padding:8px 15px; border-radius:50px; cursor:pointer; font-weight:bold; transition:0.2s; display:flex; align-items:center; gap:5px;">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> ${post.commentCount || 0}
                        </button>
                    </div>
                `;
                postsGrid.appendChild(postDiv);
            });
        }).catch(err => {
            console.error("Errore caricamento feed profilo:", err);
            postsGrid.innerHTML = '<div style="text-align:center; color:#ef4444; padding:20px;">Errore caricamento.</div>';
        });
    }
};

    // --- HELPER: accordion generico per livelli ---
window._renderAccordion = (levels, learned, containerEl) => {
    containerEl.style.display = 'block';
    containerEl.innerHTML = '';
    let anyLearned = false;
    levels.forEach(({ label, data, color }) => {
        const inLevel = data.filter(i => learned.includes(i.k));
        if (!inLevel.length) return;
        anyLearned = true;
        const section = document.createElement('div');
        section.style.cssText = 'margin-bottom:8px; border-radius:12px; overflow:hidden; border:1px solid var(--border);';
        const header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:var(--bg-card); cursor:pointer; user-select:none;';
        const arrow = document.createElement('span');
        arrow.style.cssText = 'display:inline-block; transition:transform 0.25s; font-size:0.75rem; color:var(--text-sub);';
        arrow.textContent = '▼';
        const labelSpan = document.createElement('span');
        labelSpan.style.cssText = `font-weight:800; font-size:1rem; color:${color || 'var(--accent-kanji)'};`;
        labelSpan.textContent = label;
        const countSpan = document.createElement('span');
        countSpan.style.cssText = 'color:var(--text-sub); font-size:0.85rem; display:flex; align-items:center; gap:8px;';
        countSpan.textContent = `${inLevel.length} `;
        countSpan.appendChild(arrow);
        header.appendChild(labelSpan);
        header.appendChild(countSpan);
        const body = document.createElement('div');
        body.style.cssText = 'display:none; padding:10px; background:var(--bg-body); grid-template-columns:repeat(auto-fill,minmax(44px,1fr)); gap:6px;';
        inLevel.forEach(item => {
            const el = document.createElement('div');
            el.className = 'inv-card active';
            el.innerText = item.k;
            el.style.cursor = 'default';
            body.appendChild(el);
        });
        header.onclick = () => {
            const open = body.style.display === 'grid';
            body.style.display = open ? 'none' : 'grid';
            arrow.style.transform = open ? '' : 'rotate(180deg)';
        };
        section.appendChild(header);
        section.appendChild(body);
        containerEl.appendChild(section);
    });
    if (!anyLearned) {
        containerEl.innerHTML = '<div style="text-align:center; color:var(--text-sub); padding:20px;">Nessun elemento ancora appreso.</div>';
    }
};

    // --- HELPER: kanji per livello (accordion) ---
window._renderKanjiByLevel = (learned, containerEl) => {
    window._renderAccordion([
        { label: 'N5', data: n5Kanji, color: 'var(--accent-kanji)' },
        { label: 'N4', data: n4Kanji, color: 'var(--accent-kanji)' },
        { label: 'N3', data: n3Kanji, color: 'var(--accent-kanji)' },
        { label: 'N2', data: n2Kanji, color: 'var(--accent-kanji)' },
        { label: 'N1', data: n1Kanji, color: 'var(--accent-kanji)' },
    ], learned, containerEl);
};

    // --- HELPER: kana per gruppo (accordion) ---
window._renderKanaByGroup = (learned, containerEl) => {
    window._renderAccordion([
        { label: 'Hiragana', data: hiraData, color: 'var(--accent-kana)' },
        { label: 'Katakana', data: kataData, color: '#8b5cf6' },
    ], learned, containerEl);
};

    // --- RENDERIZZA LA GRIGLIA DELL'AMICO ---
window.friendCurrentGrid = null;

window.renderFriendGrid = (type) => {
    if(!currentFriendViewData) return;
    const grid = document.getElementById('friend-grid');
    const sbKanji = document.getElementById('sb-kanji');
    const sbKana = document.getElementById('sb-kana');

    if (window.friendCurrentGrid === type) {
        window.friendCurrentGrid = null;
        grid.innerHTML = '';
        grid.style.display = '';
        if (sbKanji) sbKanji.style.border = '1px solid var(--border)';
        if (sbKana) sbKana.style.border = '1px solid var(--border)';
        return;
    }
    window.friendCurrentGrid = type;
    const learned = currentFriendViewData.learned || [];

    if (sbKanji && sbKana) {
        if (type === 'kanji') {
            sbKanji.style.border = '2px solid var(--accent-kanji)';
            sbKana.style.border = '1px solid var(--border)';
        } else {
            sbKana.style.border = '2px solid var(--accent-kana)';
            sbKanji.style.border = '1px solid var(--border)';
        }
    }

    if (type === 'kanji') {
        window._renderKanjiByLevel(learned, grid);
        return;
    }

    window._renderKanaByGroup(learned, grid);
};

window.toggleFriendPosts = () => {
    const grid = document.getElementById('friend-posts-grid');
    const arrow = document.getElementById('friend-posts-arrow');
    if (!grid) return;
    const isOpen = grid.style.display === 'flex';
    grid.style.display = isOpen ? 'none' : 'flex';
    grid.style.flexDirection = 'column';
    grid.style.gap = '15px';
    if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
};

    // --- LISTA AMICI (Design Nuovo) ---
    window.renderFriends = async () => {
        const list = document.getElementById('friends-list');
        list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);">Caricamento...</div>';
        
        let arr = [];
        for(const fid of userData.friends) {
            const s = await getDoc(doc(db,"users",fid));
            if(s.exists()) arr.push({id: s.id, ...s.data()});
        }
        
        arr.sort((a,b) => (b.learned?.length||0) - (a.learned?.length||0));
        
        list.innerHTML = '';
        if(arr.length === 0) {
            list.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-sub);">Non hai ancora amici.<br>Condividi il tuo codice!</div>';
            return;
        }

        // TOLTI I VOCABOLI DAL TOTALE QUI
        const totalItems = kanjiData.length+hiraData.length+kataData.length;
        
        arr.forEach((f, i) => {
            const lLen = f.learned ? f.learned.length : 0;
            const pct = Math.round((lLen/totalItems)*100);
            
            const div = document.createElement('div');
            div.className = 'friend-list-card';
            div.onclick = () => viewFriendProfile(f.id);
            
            div.innerHTML = `
                <div style="display:flex; align-items:center; gap:15px; flex:1;" onclick="viewFriendProfile('${f.id}')">
                    <div style="font-size:2.2rem;">${f.avatar || '👤'}</div>
                    <div>
                        <div style="font-weight:700; color:var(--text-main);">${f.username}</div>
                        <div style="font-size:0.8rem; color:var(--text-sub);">${pct}% completato</div>
                    </div>
                </div>
                <button onclick="window.removeFriend('${f.id}', '${f.username}')" style="background:transparent; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;" title="Rimuovi amico">✕</button>
            `;
            list.appendChild(div);
        });
    };

    // --- CLASSIFICA (FIX) ---
    window.renderHomeLeaderboard = async () => {
        const c = document.getElementById('home-leaderboard-list');
        if(!c) return;
        c.innerHTML = '<div style="font-size:0.8rem; color:var(--text-sub);">Aggiornamento...</div>';
        try {
            let myScore = (userData.learned && Array.isArray(userData.learned)) ? userData.learned.length : 0;
            let allUsers = [{ name: userData.username || "Io", score: myScore, isMe: true }];
            if (userData.friends && userData.friends.length > 0) {
                const promises = userData.friends.map(fid => getDoc(doc(db, "users", fid)));
                const results = await Promise.allSettled(promises);
                results.forEach(res => {
                    if(res.status === 'fulfilled' && res.value.exists()) {
                        const d = res.value.data();
                        allUsers.push({ name: d.username || "Amico", score: (d.learned ? d.learned.length : 0), isMe: false });
                    }
                });
            }
            allUsers.sort((a,b) => b.score - a.score);
            c.innerHTML = '';
            allUsers.slice(0, 3).forEach((u, i) => {
                const row = document.createElement('div');
                row.className = 'hl-row';
                let color = 'var(--text-sub)'; if(i===0) color = '#E11D48'; if(i===1) color = '#D97706'; if(i===2) color = '#059669';
                row.innerHTML = `<div style="display:flex; align-items:center; gap:10px;"><div style="font-weight:800; color:${color}; width:20px;">#${i+1}</div><div style="font-weight:600; ${u.isMe ? 'color:var(--primary);' : ''}">${u.name} ${u.isMe ? '(Tu)' : ''}</div></div><div style="font-family:monospace; font-weight:700;">${u.score}</div>`;
                c.appendChild(row);
            });
            if (allUsers.length === 1) c.innerHTML += '<div style="text-align:center; font-size:0.8rem; color:var(--text-sub); margin-top:10px;">Aggiungi amici per sfidarli!</div>';
        } catch (e) { console.error(e); c.innerHTML = "Errore classifica."; }
    };

    // --- QUIZ LOGIC ---
    let currentDB=[], chosen=[], mode='', curIdx=0, score=0, totalInitial=0;

    // Espone mode per il listen mode (non accessibile dall'esterno del modulo)
    window._setQuizMode = (m) => { mode = m; };
    window._getQuizChosen = () => chosen;
    window._getQuizCurIdx = () => curIdx;

    // Esposto globalmente per customDecks.js (modulo separato senza accesso a currentDB/chosen/mode)
    window.startQuizWithDeck = (cards) => {
        currentDB = [...cards];
        chosen = [];
        mode = 'lettura';
        comboAttuale = 0;
        comboMassima = 0;
        kanjiSbagliati = [];
        window._quizReturnView = 'view-selection';
        const tradRowDeck = document.getElementById('traduzione-toggle-row');
        if (tradRowDeck) tradRowDeck.style.display = 'none';
        window._tradMode = false;
        sessionStorage.removeItem('lastSelectionCtx');
        showView('view-selection');
        const container = document.getElementById('chip-container');
        if (!container) return;
        container.innerHTML = '';
        currentDB.forEach(item => {
            const el = document.createElement('div');
            el.className = 'chip' + (userData.learned?.includes(item.k) ? ' learned' : '');
            el.innerText = item.k;
            el.onclick = () => {
                el.classList.toggle('selected');
                const p = chosen.indexOf(item);
                if (p > -1) chosen.splice(p, 1);
                else chosen.push(item);
            };
            container.appendChild(el);
        });
    };

    window.setup = (type, m) => {
        if(type==='kanji') currentDB=kanjiData;
        else if(type==='hiragana') currentDB=hiraData;
        else if(type==='katakana') currentDB=kataData;

        window.currentFreeQuizCategory = (type === 'kanji') ? 'kanji' : (type === 'hiragana' || type === 'katakana') ? 'kana' : null;
        window._quizReturnView = 'view-selection';

        mode=m;
        showView('view-selection'); 
        chosen = []; 
        
        const c = document.getElementById('chip-container'); 
        c.innerHTML = ''; 

        // Se sono KANA, li dividiamo per gruppi
        if(type === 'hiragana' || type === 'katakana') {
            const groups = {
                "Vocali": ["あ", "い", "う", "え", "お", "ア", "イ", "ウ", "エ", "オ"],
                "Riga K": ["か", "き", "く", "け", "こ", "カ", "キ", "ク", "ケ", "コ"],
                "Riga S": ["さ", "し", "す", "せ", "そ", "サ", "シ", "ス", "セ", "ソ"],
                "Riga T": ["た", "ち", "つ", "て", "と", "タ", "チ", "ツ", "テ", "ト"],
                "Riga N": ["な", "に", "ぬ", "ね", "の", "ナ", "ニ", "ヌ", "ネ", "ノ"],
                "Riga H": ["は", "ひ", "ふ", "へ", "ほ", "ハ", "ヒ", "フ", "ヘ", "ホ"],
                "Riga M": ["ま", "み", "む", "め", "も", "マ", "ミ", "ム", "メ", "モ"],
                "Riga Y": ["や", "ゆ", "よ", "ヤ", "ユ", "ヨ"],
                "Riga R": ["ら", "り", "る", "れ", "ろ", "ラ", "リ", "ル", "レ", "ロ"],
                "Riga W / N": ["わ", "を", "ん", "ワ", "ヲ", "ン"],
                "Dakuten (゛/ ゜)": ["が", "ぎ", "ぐ", "げ", "ご", "ざ", "じ", "ず", "ぜ", "ぞ", "だ", "ぢ", "づ", "で", "ど", "ば", "び", "ぶ", "べ", "ぼ", "ぱ", "ぴ", "ぷ", "ぺ", "ぽ", "ガ", "ギ", "グ", "ゲ", "ゴ", "ザ", "ジ", "ズ", "ゼ", "ゾ", "ダ", "ヂ", "ヅ", "デ", "ド", "バ", "ビ", "ブ", "ベ", "ボ", "パ", "ピ", "プ", "ペ", "ポ"],
                "Contratti (Ya/Yu/Yo)": ["きゃ", "きゅ", "きょ", "しゃ", "しゅ", "しょ", "ちゃ", "ちゅ", "ちょ", "にゃ", "にゅ", "にょ", "ひゃ", "ひゅ", "ひょ", "みゃ", "みゅ", "みょ", "りゃ", "りゅ", "りょ", "ぎゃ", "ぎゅ", "ぎょ", "じゃ", "じゅ", "じょ", "びゃ", "びゅ", "びょ", "ぴゃ", "ぴゅ", "ぴょ", "キャ", "キュ", "キョ", "シャ", "シュ", "ショ", "チャ", "チュ", "チョ", "ニャ", "ニュ", "ニョ", "ヒャ", "ヒュ", "ヒョ", "ミャ", "ミュ", "ミョ", "リャ", "リュ", "リョ", "ギャ", "ギュ", "ギョ", "ジャ", "ジュ", "ジョ", "ビャ", "ビュ", "ビョ", "ピャ", "ピュ", "ピョ"]
            };

            for (let gName in groups) {
                // Filtriamo i kana del DB attuale che appartengono a questo gruppo
                const filtered = currentDB.filter(item => groups[gName].includes(item.k));
                
                if(filtered.length > 0) {
                    // Creiamo un titolo cliccabile per la selezione di massa
                    const title = document.createElement('div');
                    title.style = "width:100%; margin-top:20px; margin-bottom:10px; font-weight:800; color:var(--primary); font-size:0.9rem; text-transform:uppercase; border-bottom:1px solid var(--border); padding-bottom:5px; display:flex; justify-content:space-between; cursor:pointer;";
                    title.innerHTML = `<span>${gName}</span> <span style="font-size:0.75rem; color:var(--text-sub); text-transform:none;">(Seleziona riga)</span>`;
                    c.appendChild(title);

                    let rowChips = []; // Array per salvare i bottoni di questa riga
                    
                    title.onclick = () => {
                        let allSelected = rowChips.every(chip => chip.classList.contains('selected'));
                        rowChips.forEach(chip => {
                            if (allSelected) {
                                chip.classList.remove('selected');
                                const p = chosen.indexOf(chip.itemData);
                                if (p > -1) chosen.splice(p, 1);
                            } else {
                                if (!chip.classList.contains('selected')) {
                                    chip.classList.add('selected');
                                    chosen.push(chip.itemData);
                                }
                            }
                        });
                    };

                    // Aggiungiamo i chip
                    filtered.forEach(item => {
                        const el = document.createElement('div');
                        el.className = 'chip' + (userData.learned?.includes(item.k) ? ' learned' : '');
                        el.innerText = item.k;

                        el.itemData = item;
                        rowChips.push(el);

                        el.onclick = () => {
                            el.classList.toggle('selected');
                            const p = chosen.indexOf(item);
                            if(p > -1) chosen.splice(p, 1);
                            else chosen.push(item);
                        };
                        c.appendChild(el);
                    });
                }
            }
        } else {
            // Se sono Kanji o altro, mostra lista normale (come prima)
            currentDB.forEach(item => {
                const el = document.createElement('div');
                el.className = 'chip' + (userData.learned?.includes(item.k) ? ' learned' : '');
                el.innerText = item.k;
                el.onclick = () => {
                    el.classList.toggle('selected');
                    const p = chosen.indexOf(item);
                    if(p > -1) chosen.splice(p, 1);
                    else chosen.push(item);
                };
                c.appendChild(el);
            });
        }
        // (Incollalo alla fine della funzione window.setup, prima dell'ultima graffa)
    const btnAll = document.querySelector('#view-selection div[onclick="toggleSelectAll()"]');
    if(btnAll) btnAll.innerText = "Seleziona Tutto";

    const tradRow = document.getElementById('traduzione-toggle-row');
    if (tradRow) tradRow.style.display = (type === 'kanji') ? 'block' : 'none';
    const chkTrad = document.getElementById('chk-traduzioni');
    if (chkTrad) chkTrad.checked = false;
    window._tradMode = false;
    };
    
    window.startQuiz = (category) => {
    const levelMap = { n5: n5Kanji, n4: n4Kanji, n3: n3Kanji, n2: n2Kanji, n1: n1Kanji };
    if (levelMap[category]) {
        chosen = [...levelMap[category]];
        mode = 'lettura';
    } else if (category === 'kana') {
        // Qui tieni la logica vecchia per i Kana
        chosen = [...hiraData, ...kataData];
    }
    
    if (chosen.length === 0) {
        alert("Seleziona almeno una carta per iniziare l'esercitazione!");
        return; // Blocca l'avvio del quiz
    }

    // 🃏 FIX: MESCOLA GLI ELEMENTI IN MODO CASUALE!
    chosen.sort(() => 0.5 - Math.random());
    
    totalInitial = chosen.length;
    curIdx = 0;
    score = 0;
    comboAttuale = 0;
    comboMassima = 0;
    kanjiSbagliati = [];
    window._tradMode = document.getElementById('chk-traduzioni')?.checked ?? false;
    window._inTranslationPhase = false;
    showView('view-quiz');
    window.checkSectionTutorial?.('kanji-quiz');
    renderQ();
};
    
    function renderQ() {
    // 1. Nascondiamo la card di aiuto e resettiamo i tasti
    document.getElementById('help-card').classList.add('hidden');
    document.getElementById('help-card').style.display = 'none'; // Forza la sparizione
    document.getElementById('btn-dont-know').classList.remove('hidden');
    const tpEl = document.getElementById('translation-phase');
    if (tpEl) tpEl.classList.add('hidden');
    window._inTranslationPhase = false;

    const inputEl = document.getElementById('quiz-input');
    inputEl.disabled = false; 
    inputEl.value = ''; 

    // 2. Recupero dati domanda corrente
    const item = chosen[curIdx]; 
    const pct = Math.round((curIdx / totalInitial) * 100);
    
    // 3. Aggiornamento Barra di Progresso
    document.getElementById('prog-bar').style.width = pct + "%";
    document.getElementById('prog-text').innerText = `Domanda ${curIdx + 1} di ${totalInitial}`;
    
    // 4. Visualizzazione Kanji/Kana (ORA CON IL BOTTONE MAZZI FLUTTUANTE)
    const safeK = item.k.replace(/'/g, "\\'");
    const safeR = item.r.replace(/'/g, "\\'");
    const safeS = item.s.replace(/'/g, "\\'");

    document.getElementById('quiz-display').innerHTML = `
        <div style="position: relative; display: inline-block;">
            ${item.k}
            <div onclick="window.preparaAggiuntaMazzo('${safeK}', '${safeR}', '${safeS}')"
                 title="Aggiungi al Mazzo"
                 style="position: absolute; top: -10px; right: -50px; width: 40px; height: 40px; border-radius: 50%; border: 3px solid var(--primary); display: flex; justify-content: center; align-items: center; color: var(--primary); cursor: pointer; transition: 0.2s; background: var(--bg-card); font-size: 1.2rem; box-shadow: 0 4px 10px rgba(0,0,0,0.1);"
                 onmouseover="this.style.background='var(--primary)'; this.style.color='white'; this.style.transform='scale(1.1)';"
                 onmouseout="this.style.background='var(--bg-card)'; this.style.color='var(--primary)'; this.style.transform='scale(1)';">
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </div>
        </div>
    `;
    
    // 5. Pulizia feedback e tasto "Continua"
    document.getElementById('feedback').innerText = ''; 
    document.getElementById('feedback').className = "feedback"; 
    document.getElementById('btn-next').classList.add('hidden'); 

    // --- IL FIX PER IL DOPPIO CLICK E IL LAYOUT ---
    setTimeout(() => {
        inputEl.focus();
    }, 100);
}
    
   window.nextQ = () => {
    curIdx++;
    if(curIdx < chosen.length) {
        renderQ();
    } else {
        window.mostraRiassunto(); // MOSTRA LA NUOVA SCHERMATA FINALE!
    }
};

window.checkTranslation = () => {
    const ti = document.getElementById('translation-input');
    const val = ti.value.toLowerCase().trim();
    const tfb = document.getElementById('translation-feedback');
    const meanings = window._currentMeanings || [];

    const ok = meanings.some(m => m.toLowerCase().trim() === val);

    document.getElementById('btn-check-translation').classList.add('hidden');
    window._inTranslationPhase = false;

    if (ok) {
        tfb.innerText = 'Corretto! ✅';
        tfb.style.color = '#10b981';
        window.playGameSound('ok');
        setTimeout(window.nextQ, 1000);
    } else {
        tfb.innerText = 'Errato! Significati: ' + meanings.join(' · ');
        tfb.style.color = '#ef4444';
        window.playGameSound('no');
        kanjiSbagliati.push(window._currentTranslationKanji);
        document.getElementById('btn-skip-translation').classList.remove('hidden');
    }
};
    
// --- SELEZIONA / DESELEZIONA TUTTO (UNIVERSALE) ---
window.toggleSelectAll = () => {
    const chips = document.querySelectorAll('#chip-container .chip');
    const btn = document.querySelector('#view-selection div[onclick="toggleSelectAll()"]');

    // Se c'è almeno un elemento e sono TUTTI selezionati, allora DESELEZIONA
    if (chosen.length > 0 && chosen.length === currentDB.length) {
        chosen = [];
        chips.forEach(c => c.classList.remove('selected'));
        if (btn) btn.innerText = "Seleziona Tutto";
    }
    // Altrimenti (se sono tutti spenti o solo alcuni accesi), SELEZIONA TUTTO
    else {
        chosen = [...currentDB];
        chips.forEach(c => c.classList.add('selected'));
        if (btn) btn.innerText = "Deseleziona Tutto";
    }
};

window._kanjiQuickFilter = null;

window.selectKanjiLearned = () => {
    const chips = document.querySelectorAll('#chip-container .chip');
    const btn = document.querySelector('#view-selection div[onclick="toggleSelectAll()"]');
    if (window._kanjiQuickFilter === 'learned') {
        chosen = [];
        chips.forEach(c => c.classList.remove('selected'));
        window._kanjiQuickFilter = null;
        if (btn) btn.innerText = "Seleziona Tutto";
        return;
    }
    chosen = [];
    chips.forEach(chip => {
        const isLearned = chip.classList.contains('learned');
        chip.classList.toggle('selected', isLearned);
        if (isLearned) {
            const item = currentDB.find(x => x.k === chip.innerText.trim());
            if (item) chosen.push(item);
        }
    });
    window._kanjiQuickFilter = 'learned';
    if (btn) btn.innerText = "Seleziona Tutto";
};

window.selectKanjiUnlearned = () => {
    const chips = document.querySelectorAll('#chip-container .chip');
    const btn = document.querySelector('#view-selection div[onclick="toggleSelectAll()"]');
    if (window._kanjiQuickFilter === 'unlearned') {
        chosen = [];
        chips.forEach(c => c.classList.remove('selected'));
        window._kanjiQuickFilter = null;
        if (btn) btn.innerText = "Seleziona Tutto";
        return;
    }
    chosen = [];
    chips.forEach(chip => {
        const isUnlearned = !chip.classList.contains('learned');
        chip.classList.toggle('selected', isUnlearned);
        if (isUnlearned) {
            const item = currentDB.find(x => x.k === chip.innerText.trim());
            if (item) chosen.push(item);
        }
    });
    window._kanjiQuickFilter = 'unlearned';
    if (btn) btn.innerText = "Seleziona Tutto";
};

    // INPUT IME
    function toHiragana(t){let r=t.replace(/([bcdfghjkmprstwyz])\1/g,'っ$1'); const m={'kya':'きゃ','kyu':'きゅ','kyo':'きょ','sha':'しゃ','shu':'しゅ','sho':'しょ','cha':'ちゃ','chu':'ちゅ','cho':'ちょ','nya':'にゃ','nyu':'にゅ','nyo':'にょ','hya':'ひゃ','hyu':'ひゅ','hyo':'ひょ','mya':'みゃ','myu':'みゅ','myo':'みょ','rya':'りゃ','ryu':'りゅ','ryo':'りょ','gya':'ぎゃ','gyu':'ぎゅ','gyo':'ぎょ','ja':'じゃ','ju':'じゅ','jo':'じょ','bya':'びゃ','byu':'びゅ','byo':'びょ','pya':'ぴゃ','pyu':'ぴゅ','pyo':'ぴょ','ka':'か','ki':'き','ku':'く','ke':'け','ko':'こ','sa':'さ','shi':'し','su':'す','se':'せ','so':'そ','ta':'た','chi':'ち','tsu':'つ','te':'て','to':'と','na':'な','ni':'に','nu':'ぬ','ne':'ね','no':'の','ha':'は','hi':'ひ','fu':'ふ','he':'へ','ho':'ほ','ma':'ま','mi':'み','mu':'む','me':'め','mo':'も','ya':'や','yu':'ゆ','yo':'よ','ra':'ら','ri':'り','ru':'る','re':'れ','ro':'ろ','wa':'わ','wo':'を','nn':'ん','ga':'が','gi':'ぎ','gu':'ぐ','ge':'げ','go':'ご','za':'ざ','ji':'じ','zu':'ず','ze':'ぜ','zo':'ぞ','da':'だ','di':'ぢ','du':'づ','de':'で','do':'ど','ba':'ば','bi':'び','bu':'ぶ','be':'べ','bo':'ぼ','pa':'ぱ','pi':'ぴ','pu':'ぷ','pe':'ぺ','po':'ぽ','a':'あ','i':'い','u':'う','e':'え','o':'お','di':'ぢ','ji':'じ'}; Object.keys(m).sort((a,b)=>b.length-a.length).forEach(k=>r=r.split(k).join(m[k])); return r;}
    function toKatakana(t){let r=t.replace(/([bcdfghjkmprstwyz])\1/g,'ッ$1'); const m={'kya':'キャ','kyu':'キュ','kyo':'キョ','sha':'シャ','shu':'シュ','sho':'ショ','cha':'チャ','chu':'チュ','cho':'チョ','nya':'ニャ','nyu':'ニュ','nyo':'ニョ','hya':'ヒャ','hyu':'ヒュ','hyo':'ヒョ','mya':'ミャ','myu':'ミュ','myo':'ミョ','rya':'リャ','ryu':'リュ','ryo':'リョ','gya':'ギャ','gyu':'ギュ','gyo':'ギョ','ja':'ジャ','ju':'ジュ','jo':'ジョ','bya':'ビャ','byu':'ビュ','byo':'ビョ','pya':'ピャ','pyu':'ピュ','pyo':'ピョ','ka':'カ','ki':'キ','ku':'ク','ke':'ケ','ko':'コ','sa':'サ','shi':'シ','su':'ス','se':'セ','so':'ソ','ta':'タ','chi':'チ','tsu':'ツ','te':'テ','to':'ト','na':'ナ','ni':'ニ','nu':'ヌ','ne':'ネ','no':'ノ','ha':'ハ','hi':'ヒ','fu':'フ','he':'ヘ','ho':'ホ','ma':'マ','mi':'ミ','mu':'ム','me':'メ','mo':'モ','ya':'ヤ','yu':'ユ','yo':'ヨ','ra':'ラ','ri':'リ','ru':'ル','re':'レ','ro':'ロ','wa':'ワ','wo':'ヲ','nn':'ン','ga':'ガ','gi':'ギ','gu':'グ','ge':'ゲ','go':'ゴ','za':'ザ','ji':'ジ','zu':'ズ','ze':'ゼ','zo':'ゾ','da':'ダ','di':'ヂ','du':'ヅ','de':'デ','do':'ド','ba':'バ','bi':'ビ','bu':'ブ','be':'ベ','bo':'ボ','pa':'パ','pi':'ピ','pu':'プ','pe':'ペ','po':'ポ','a':'ア','i':'イ','u':'ウ','e':'エ','o':'オ','di':'ヂ','ji':'ジ'}; Object.keys(m).sort((a,b)=>b.length-a.length).forEach(k=>r=r.split(k).join(m[k])); return r;}

    // ... (qui sopra ci sono le funzioni toHiragana e toKatakana che finiscono) ...

    // CANCELLA LA VECCHIA RIGA oninput E INCOLLA QUESTO BLOCCO:
    document.getElementById('quiz-input').oninput = function() {
        // 1. Se stiamo scrivendo il significato in italiano, NON trasformare nulla
        if(mode === 'significato') return;

        // 2. Recuperiamo l'oggetto che stiamo studiando
        if(!chosen || chosen.length === 0 || !chosen[curIdx]) return;
        const item = chosen[curIdx];

        // 3. CAPISCE SE DEVE TRASFORMARE IN GIAPPONESE:
        // Deve farlo SOLO se la risposta corretta (item.r) è in Hiragana/Katakana (come nei Kanji o Verbi).
        // Se la risposta corretta è in lettere (come nei quiz dei Kana), deve lasciarci scrivere in lettere!
        const responseIsJapanese = /[\u3040-\u30ff]/.test(item.r);

        if (responseIsJapanese) {
            const isKata = /[\u30a0-\u30ff]/.test(item.k);
            const val = this.value.toLowerCase();
            this.value = isKata ? toKatakana(val) : toHiragana(val);
        }
        // Se responseIsJapanese è falso, la tastiera rimane "italiana" e scrivi 'a', 'ka', ecc.
    };

    // ... (qui sotto c'è window.check) ...
    document.getElementById('quiz-input').onkeydown=(e)=>{if(e.key==='Enter')check()};
    document.getElementById('translation-input').onkeydown=(e)=>{if(e.key==='Enter' && window._inTranslationPhase) window.checkTranslation()};
    
    window.check = () => { 
    const val = document.getElementById('quiz-input').value.toLowerCase().trim(); 
    const item = chosen[curIdx]; 
    let ok = false;

    if(mode === 'lettura' || mode === 'review') ok = (val === item.r); 
    else if(mode === 'significato') ok = (val === item.s.toLowerCase()); 
    else ok = (val === item.r);
    
    const fb = document.getElementById('feedback');

    if(ok) { 
        fb.innerText = "Corretto!"; 
        fb.className = "feedback ok"; 
        playGameSound('ok');
        
        window.aggiornaCombo(true); // COMBO UP!

        if(document.getElementById('btn-next').classList.contains('hidden')) {
            score++;
        }

        if(mode !== 'review' && !userData.learned.includes(item.k)){
            userData.learned.push(item.k);
            updateDoc(doc(db,"users",currentUser.uid),{learned:userData.learned}).catch(console.error);
        }

        if(mode === 'review') {
            if(_errHas(userData.errors, item.k)) {
                userData.errors = _errRemove(userData.errors, item.k);
                updateDoc(doc(db,"users",currentUser.uid),{errors:userData.errors}).catch(console.error);
            }
        }

        const meanings = (window._tradMode && !window._inTranslationPhase)
            ? window._getMeanings(item.k) : null;
        if (meanings && meanings.length > 0) {
            window._inTranslationPhase = true;
            window._currentMeanings = meanings;
            window._currentTranslationKanji = item.k;
            setTimeout(() => {
                const tp = document.getElementById('translation-phase');
                const ti = document.getElementById('translation-input');
                const tfb = document.getElementById('translation-feedback');
                tp.classList.remove('hidden');
                ti.value = '';
                tfb.innerText = '';
                tfb.style.color = '';
                document.getElementById('btn-check-translation').classList.remove('hidden');
                document.getElementById('btn-skip-translation').classList.add('hidden');
                document.getElementById('btn-next').classList.add('hidden');
                setTimeout(() => ti.focus(), 50);
            }, 800);
        } else {
            setTimeout(nextQ, 1000);
        } 
    } else { 
        let correct = (mode === 'significato') ? item.s : item.r;
        fb.innerText = "Errato: " + correct; 
        fb.className = "feedback no"; 
        playGameSound('no');
        
        window.aggiornaCombo(false); // COMBO DOWN!
        kanjiSbagliati.push(item.k); // SALVA IN "DA RIPASSARE"
        
        document.getElementById('btn-next').classList.remove('hidden'); 
        
        if(!userData.errors) userData.errors = [];
        if(!_errHas(userData.errors, item.k)) {
            userData.errors.push({k: item.k, r: item.r, s: item.s});
            updateDoc(doc(db,"users",currentUser.uid),{errors:userData.errors}).catch(console.error);
        }
    }
    updateErrorUI();
};

    // --- AUDIO & TEORIA ---
    window.playAudio = (textOverride) => {
        const text = textOverride || document.getElementById('quiz-display').innerText;
        if (!text) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ja-JP';
        u.rate = 0.75;
        u.pitch = 1.1;
        u.volume = 1;
        const voices = window.speechSynthesis.getVoices();
        const jpVoice = voices.find(v => v.lang === 'ja-JP' && v.name.toLowerCase().includes('google'))
                     || voices.find(v => v.lang === 'ja-JP');
        if (jpVoice) u.voice = jpVoice;
        window.speechSynthesis.speak(u);
    };
    window.playGameSound = (type) => { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); if (type === 'ok') { osc.type = 'sine'; osc.frequency.setValueAtTime(500, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1); gain.gain.setValueAtTime(0.2, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5); osc.start(); osc.stop(ctx.currentTime + 0.5); } else { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.2); gain.gain.setValueAtTime(0.2, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3); osc.start(); osc.stop(ctx.currentTime + 0.3); } };
    window.showTheory = () => {
        showView('view-learn-levels');
    };

    window.showTheoryN5 = () => {
        showView('view-theory');
        const firstTab = document.querySelector('#view-theory .inv-tab');
        if (firstTab) switchTheory('intro', firstTab);
    };

    window.switchTheory = (tab, btn) => {
        document.querySelectorAll('#view-theory .inv-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const ids = ['intro','numbers','particles','verbs','adjectives','counters','expressions'];
        ids.forEach(id => {
            const el = document.getElementById('theory-' + id);
            if(el) el.classList.add('hidden');
        });

        const target = document.getElementById('theory-' + tab);
        if(target) target.classList.remove('hidden');
    };

    // --- 2. GESTIONE ERRORI ---
    // Helpers per formato errori: supporta sia il vecchio formato stringa che il nuovo formato oggetto {k,r,s}
    const _errKey = e => (e && typeof e === 'object') ? e.k : e;
    const _errHas = (list, k) => list.some(e => _errKey(e) === k);
    const _errRemove = (list, k) => list.filter(e => _errKey(e) !== k);

    window.updateErrorUI = function() {
        if(!userData || !userData.errors) return;

        // Deduplicazione per chiave k (funziona con entrambi i formati)
        const seen = new Set();
        const errs = userData.errors.filter(e => {
            const k = _errKey(e);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
        if (errs.length !== userData.errors.length) userData.errors = errs;

        const btn = document.getElementById('error-review-box');
        const count = document.getElementById('err-count');
        if(btn && count) {
            if(errs.length > 0) {
                btn.classList.remove('hidden');
                count.innerText = errs.length;
            } else {
                btn.classList.add('hidden');
            }
        }
    };

    // --- FUNZIONE RIPASSO ERRORI (VERSIONE FIXATA CON MAZZI CUSTOM) ---
    window.startErrorReview = function() {
        console.log("Tentativo avvio ripasso errori..."); // Controllo in console

        // 1. Controllo base: ci sono errori salvati?
        if(!userData.errors || userData.errors.length === 0) {
            return alert("Nessun errore da ripassare! Ottimo lavoro.");
        }
        
        // 2. COSTRUZIONE DEL DATABASE COMPLETO
        let bigDB = [];

        // Aggiungiamo le liste standard (se esistono)
        if(typeof kanjiData !== 'undefined') bigDB = bigDB.concat(kanjiData);
        if(typeof hiraData !== 'undefined') bigDB = bigDB.concat(hiraData);
        if(typeof kataData !== 'undefined') bigDB = bigDB.concat(kataData);

        // Aggiungiamo i CLASSIFICATORI
        if(typeof countersData !== 'undefined') {
            Object.values(countersData).forEach(listaGruppo => {
                bigDB = bigDB.concat(listaGruppo);
            });
        }

        // FIX: AGGIUNGIAMO I MAZZI PERSONALIZZATI AL SUPER-DATABASE
        if(typeof customDecks !== 'undefined' && customDecks.length > 0) {
            customDecks.forEach(deck => {
                if(deck.cards && deck.cards.length > 0) {
                    bigDB = bigDB.concat(deck.cards);
                }
            });
        }

        // 3. COSTRUZIONE chosen: usa direttamente gli oggetti salvati (nuovo formato)
        // oppure cerca nel bigDB per compatibilità con il vecchio formato stringa
        const _seenK = new Set();
        chosen = [];
        for (const e of userData.errors) {
            if (typeof e === 'object' && e.k && e.r) {
                // Nuovo formato: oggetto completo {k,r,s} — lettura garantita identica all'originale
                if (!_seenK.has(e.k)) {
                    _seenK.add(e.k);
                    chosen.push(e);
                }
            } else {
                // Vecchio formato stringa: cerca nel bigDB
                const match = bigDB.find(item => item.k === e);
                if (match && !_seenK.has(match.k)) {
                    _seenK.add(match.k);
                    chosen.push(match);
                }
            }
        }

        // Sanifica userData.errors rimuovendo eventuali duplicati accumulati
        const _seenKeys = new Set();
        const _uniqueErrors = userData.errors.filter(e => {
            const k = _errKey(e); if (_seenKeys.has(k)) return false; _seenKeys.add(k); return true;
        });
        if (_uniqueErrors.length !== userData.errors.length) {
            userData.errors = _uniqueErrors;
            updateDoc(doc(db,'users',currentUser.uid), {errors: _uniqueErrors}).catch(console.error);
        }

        chosen.sort(() => 0.5 - Math.random());
        console.log("Elementi trovati per il ripasso:", chosen.length);

        // 4. Se non troviamo nulla (magari gli errori salvati sono vecchi)
        if(chosen.length === 0) {
            alert("Lista errori sincronizzata. Nessun dato trovato nel database attuale.");
            userData.errors = [];
            updateDoc(doc(db,"users",currentUser.uid), {errors: []});
            window.updateErrorUI();
            return;
        }

        // 5. AVVIO QUIZ
        mode = 'review'; 
        totalInitial = chosen.length;
        curIdx = 0;
        score = 0;
        
        showView('view-quiz');
        window.checkSectionTutorial?.('kanji-quiz');
        renderQ();
    };
// --- GESTIONE TASTIERA IPHONE ---
    const qInput = document.getElementById('quiz-input');
    
    // Quando clicchi dentro la casella (Tastiera SU)
    qInput.addEventListener('focus', () => {
        document.body.classList.add('keyboard-active');
        // Scorri leggermente per assicurare che l'input sia visibile
        setTimeout(() => {
            qInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    });

    // Quando clicchi fuori o premi invio (Tastiera GIÙ)
    qInput.addEventListener('blur', () => {
        document.body.classList.remove('keyboard-active');
        window.scrollTo(0, 0); // Resetta la posizione
    });

    // --- GESTIONE MENU KANJI (MULTI-SELEZIONE) ---
    let selectedKanjiCategories = [];

    window.showKanjiMenu = () => {
        const modal = document.getElementById('kanji-modal');
        modal.classList.remove('hidden');

        // Ricrea il contenuto del modale dinamicamente
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; padding: 25px; background: var(--bg-card); border-radius: 16px; margin: 10vh auto; text-align: center; border: 1px solid var(--border);">
                <h2 style="margin-bottom: 10px; color: var(--text-main);">Seleziona Categorie</h2>
                <p style="color: var(--text-sub); margin-bottom: 20px; font-size: 0.9rem;">Scegli una o più categorie su cui esercitarti.</p>
                <div id="kanji-cat-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 25px;">
                </div>
                <div style="display: flex; gap: 10px;">
                    <button onclick="closeKanjiMenu()" style="flex:1; padding:12px; border-radius:12px; background:var(--bg-body); color:var(--text-main); border:1px solid var(--border); cursor:pointer; font-weight:600;">Annulla</button>
                    <button onclick="confirmKanjiCategories()" style="flex:1; padding:12px; border-radius:12px; background:var(--primary); color:white; border:none; cursor:pointer; font-weight:bold;">Conferma ➔</button>
                </div>
            </div>
        `;

        const grid = document.getElementById('kanji-cat-grid');
        selectedKanjiCategories = []; // Resetta le selezioni precedenti
        
        // Genera i bottoni per ogni livello JLPT
        ['n5','n4','n3','n2','n1'].forEach(cat => {
            const btn = document.createElement('div');
            btn.innerText = cat.toUpperCase();
            btn.style = "padding: 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-body); color: var(--text-main); cursor: pointer; transition: 0.2s; font-weight: 600;";
            
            btn.onclick = () => {
                const idx = selectedKanjiCategories.indexOf(cat);
                if (idx > -1) {
                    // Deseleziona
                    selectedKanjiCategories.splice(idx, 1);
                    btn.style.background = 'var(--bg-body)';
                    btn.style.color = 'var(--text-main)';
                    btn.style.borderColor = 'var(--border)';
                } else {
                    // Seleziona
                    selectedKanjiCategories.push(cat);
                    btn.style.background = 'var(--primary)';
                    btn.style.color = 'white';
                    btn.style.borderColor = 'var(--primary)';
                }
            };
            grid.appendChild(btn);
        });
    };

    window.closeKanjiMenu = () => {
        document.getElementById('kanji-modal').classList.add('hidden');
    };

    window.confirmKanjiCategories = () => {
        if(selectedKanjiCategories.length === 0) return alert("Seleziona almeno una categoria!");
        
        closeKanjiMenu();
        
        // Unisce tutte le parole delle categorie selezionate in un unico array
        const levelMap = { n5: n5Kanji, n4: n4Kanji, n3: n3Kanji, n2: n2Kanji, n1: n1Kanji };
        currentDB = [];
        selectedKanjiCategories.forEach(cat => {
            if (levelMap[cat]) currentDB = currentDB.concat(levelMap[cat]);
        });
        
        mode = 'lettura'; // Modalità quiz di default
        chosen = [...currentDB]; // Le seleziona tutte di default
        
        showView('view-selection');
        
        const c = document.getElementById('chip-container');
        c.innerHTML = '';
        
        currentDB.forEach(item => {
            const el = document.createElement('div');
            el.className = 'chip selected' + (userData.learned?.includes(item.k) ? ' learned' : '');
            el.innerText = item.k;
            
            el.onclick = () => { 
                el.classList.toggle('selected'); 
                const p = chosen.indexOf(item); 
                if(p > -1) chosen.splice(p, 1); 
                else chosen.push(item); 
            };
            c.appendChild(el);
        });
        
        const btn = document.querySelector('#view-selection div[onclick="toggleSelectAll()"]');
        if(btn) btn.innerText = "Deseleziona Tutto";

        const tradRowCat = document.getElementById('traduzione-toggle-row');
        if (tradRowCat) tradRowCat.style.display = 'block';
        const chkTradCat = document.getElementById('chk-traduzioni');
        if (chkTradCat) chkTradCat.checked = false;
        window._tradMode = false;
    };

    // --- LOGICA SETUP DRILL VERBI ---
    
    // --- LOGICA SETUP DRILL VERBI (NUOVA VERSIONE "A SCATOLE CINESI") ---
    
    window.selectedVerbForms = ['masu'];
    window.verbDrillCount = 10;
    window.currentMacroForm = 'masu';
    window.selectedVerbGroups = [1, 2, 3];

    window.openVerbSetup = () => {
        showView('view-verb-setup');
    };

    // Gestisce il click sulle 4 forme principali (Masu, Te, Nai, Base)
    window.selectMacroForm = (form, btn) => {
        // Resetta lo stile di tutti i bottoni macro
        document.querySelectorAll('.btn-macro-form').forEach(b => {
            b.style.background = 'var(--bg-body)';
            b.style.color = 'var(--text-main)';
            b.style.borderColor = 'var(--border)';
        });
        
        // Accende il bottone cliccato
        btn.style.background = 'var(--primary)';
        btn.style.color = 'white';
        btn.style.borderColor = 'var(--primary)';

        window.currentMacroForm = form;
        const masuContainer = document.getElementById('masu-sub-forms');

        if (form === 'masu') {
            // Mostra i sottomenù dei tempi
            masuContainer.classList.remove('hidden');
            masuContainer.style.display = 'block';
            
            // Se non c'era niente di selezionato, imposta 'masu' di default
            if(window.selectedVerbForms.length === 0 || !['masu','masen','mashita','masendeshita'].some(r => window.selectedVerbForms.includes(r))) {
                window.selectedVerbForms = ['masu'];
                document.querySelectorAll('#masu-sub-forms .chip').forEach(c => c.classList.remove('selected'));
                document.querySelector('#masu-sub-forms .chip').classList.add('selected');
            }
        } else {
            // Nasconde i sottomenù e imposta direttamente l'unica forma scelta
            masuContainer.classList.add('hidden');
            masuContainer.style.display = 'none';
            window.selectedVerbForms = [form];
        }
    };

    // Gestisce l'accensione/spegnimento dei tempi verbali della forma Masu
    window.toggleMasuForm = (form, chip) => {
        chip.classList.toggle('selected');
        const idx = window.selectedVerbForms.indexOf(form);
        
        // Rimuove eventuali forme non-masu (es. se prima aveva cliccato Forma Te)
        window.selectedVerbForms = window.selectedVerbForms.filter(f => ['masu','masen','mashita','masendeshita'].includes(f));

        if (idx > -1) {
            window.selectedVerbForms.splice(idx, 1);
        } else {
            window.selectedVerbForms.push(form);
        }
    };

    window.toggleVerbGroup = (group, chip) => {
        const idx = window.selectedVerbGroups.indexOf(group);
        if (idx > -1) {
            if (window.selectedVerbGroups.length === 1) return; // almeno uno sempre attivo
            window.selectedVerbGroups.splice(idx, 1);
            chip.classList.remove('selected');
        } else {
            window.selectedVerbGroups.push(group);
            chip.classList.add('selected');
        }
    };

    // Cambia il numero di domande
    window.setVerbCount = (el, count) => {
        const container = document.getElementById('verb-count-container');
        const chips = container.querySelectorAll('.chip');
        chips.forEach(c => c.classList.remove('selected'));
        
        el.classList.add('selected');
        verbDrillCount = count;
    };
    
    // --- MOTORE GRAMMATICALE VERBI ---

    // Variabile globale per lo stato dei furigana
    window.showFurigana = true;

    window.toggleFurigana = () => {
        window.showFurigana = !window.showFurigana;
        
        const btn = document.getElementById('btn-furigana-verbi');
        if(btn) {
            btn.innerText = window.showFurigana ? "Furigana: ON" : "Furigana: OFF";
            btn.style.background = window.showFurigana ? "var(--primary)" : "transparent";
            btn.style.color = window.showFurigana ? "white" : "var(--text-sub)";
            btn.style.border = "1px solid " + (window.showFurigana ? "var(--primary)" : "var(--border)");
        }
        
        // Se siamo nel mezzo del quiz, aggiorna immediatamente la schermata
        if(!document.getElementById('view-verb-quiz').classList.contains('hidden') && currentVerbObj) {
            // Salviamo il valore inserito per non cancellarlo mentre si aggiorna la grafica
            const currentInput = document.getElementById('verb-answer-input').value;
            renderVerbQuestion();
            document.getElementById('verb-answer-input').value = currentInput;
        }
    };

    let drillQueue = [];
    let currentVerbIdx = 0;
    let currentVerbObj = null;
    let currentTargetForm = "";
    let correctConjugation = "";

    

    

window.generateScopoSentence = (v1, v2) => {
    // v1: oggetto verbo di scopo (es. {k: '食べる', r: 'たべる', g: 2})
    // v2: oggetto verbo di movimento (es. {k: '行く', r: 'いく', g: 1})
    
    // Prendiamo la radice del verbo di scopo (togliendo l'ultimo carattere)
    // Nota: questo è un metodo semplificato, perfetto per i verbi regolari che abbiamo finora
    let radiceV1 = v1.k.slice(0, -1); 
    
    // Se il verbo è irregolare (fare/する), la radice è diversa, ma teniamola semplice per ora
    if (v1.k === 'する') radiceV1 = 'し';

    return `${radiceV1}に${v2.k}ます`;
};


    

    // 2. Genera la spiegazione dell'errore
    

    // --- LOGICA DI GIOCO ---

    window.initVerbDrill = () => {
        if(selectedVerbForms.length === 0) { alert("Seleziona almeno una forma verbale!"); return; }

        const groups = window.selectedVerbGroups || [1, 2, 3];
        const filteredVerbs = verbData.filter(v => groups.includes(v.g));
        if (filteredVerbs.length === 0) { window.showToast("Nessun verbo disponibile per i gruppi selezionati!", true); return; }

        // Mischia i verbi del gruppo selezionato
        let shuffledVerbs = [...filteredVerbs].sort(() => 0.5 - Math.random());
        let limit = verbDrillCount === 'all' ? shuffledVerbs.length : Math.min(verbDrillCount, shuffledVerbs.length);
        
        drillQueue = [];
        for(let i=0; i<limit; i++) {
            let randomForm = selectedVerbForms[Math.floor(Math.random() * selectedVerbForms.length)];
            drillQueue.push({ verb: shuffledVerbs[i], form: randomForm });
        }
        
        // RESET VARIABILI PER LA SCHERMATA RIASSUNTIVA FINALE
        totalInitial = drillQueue.length;
        score = 0;
        comboAttuale = 0;
        comboMassima = 0;
        kanjiSbagliati = [];

        currentVerbIdx = 0;
        window.currentFreeQuizCategory = 'verbi';
        window._quizReturnView = 'view-verb-setup';
        showView('view-verb-quiz');
        window.checkSectionTutorial?.('verb-quiz');
        renderVerbQuestion();
    };

    window.renderVerbQuestion = () => {
        document.getElementById('verb-feedback-box').classList.add('hidden');
        document.getElementById('verb-check-btn').classList.remove('hidden');
        
        let q = drillQueue[currentVerbIdx];
        currentVerbObj = q.verb;
        currentTargetForm = q.form;
        correctConjugation = conjugate(currentVerbObj, currentTargetForm);
        window.correctConjugationKana = conjugateKana(currentVerbObj, currentTargetForm); 

        document.getElementById('verb-progress').innerText = `${currentVerbIdx + 1} / ${drillQueue.length}`;
        document.getElementById('verb-progress-bar').style.width = `${((currentVerbIdx + 1) / drillQueue.length) * 100}%`;
        document.getElementById('verb-target-form').innerText = formNames[currentTargetForm];
        
        // --- LA MAGIA INIZIA QUI ---
        let displayKanji = currentVerbObj.k;
        let displayFurigana = currentVerbObj.r;

        // Se stiamo chiedendo la forma dizionario, mostriamo la forma ます come punto di partenza!
        if (currentTargetForm === 'dizionario') {
            displayKanji = conjugate(currentVerbObj, 'masu');
            displayFurigana = conjugateKana(currentVerbObj, 'masu');
        }
        // --- FINE MAGIA ---

        // CONTROLLO FURIGANA ATTIVI O SPENTI
        if (window.showFurigana) {
            document.getElementById('verb-kanji-display').innerHTML = `<ruby>${displayKanji}<rt style="font-size: 0.4em; color: var(--primary); font-weight: 700; margin-bottom: 5px;">${displayFurigana}</rt></ruby>`;
        } else {
            document.getElementById('verb-kanji-display').innerHTML = displayKanji;
        }
        
        document.getElementById('verb-meaning-display').innerText = currentVerbObj.s;
        
        let inputEl = document.getElementById('verb-answer-input');
        inputEl.value = "";
        inputEl.focus();
    };

    window.checkVerbAnswer = () => {
        let input = document.getElementById('verb-answer-input').value.trim();
        if(input === "") return;

        // Controlla se hai scritto in Kanji OPPURE tutto in Hiragana
        if(input === correctConjugation || input === window.correctConjugationKana || input === correctConjugation.replace(/する/g, "します")) {
            // Giusto! Suona, alza la combo e dai il punto (se è il primo tentativo)
            if(typeof playGameSound === 'function') playGameSound('ok');
            window.aggiornaCombo(true); 
            
            if(document.getElementById('verb-feedback-box').classList.contains('hidden')) {
                score++;
            }
            
            nextVerbQuestion();
        } else {
            // Sbagliato! Suona, azzera combo e salva l'errore
            if(typeof playGameSound === 'function') playGameSound('no');
            window.aggiornaCombo(false); 
            
            if(!kanjiSbagliati.includes(currentVerbObj.k)) {
                kanjiSbagliati.push(currentVerbObj.k);
            }

            // Mostra la spiegazione
            document.getElementById('verb-check-btn').classList.add('hidden');
            let box = document.getElementById('verb-feedback-box');
            let text = document.getElementById('verb-feedback-text');
            
            text.innerHTML = getExplanation(currentVerbObj, currentTargetForm, correctConjugation);
            box.classList.remove('hidden');
        }
    };

    window.nextVerbQuestion = () => {
        currentVerbIdx++;
        if(currentVerbIdx >= drillQueue.length) {
            // Lancia la schermata bella invece del popup brutto!
            window.mostraRiassunto();
        } else {
            renderVerbQuestion();
        }
    };
    
    // Permette di premere "Invio" sulla tastiera per confermare
    document.getElementById('verb-answer-input').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            if (document.getElementById('verb-feedback-box').classList.contains('hidden')) {
                checkVerbAnswer();
            } else {
                nextVerbQuestion();
            }
        }
    });
    // --- TASTIERA AUTOMATICA HIRAGANA PER I VERBI ---
    document.getElementById('verb-answer-input').oninput = function() {
        const val = this.value.toLowerCase();
        this.value = toHiragana(val); // Trasforma i caratteri latini in hiragana!
    };
 window.showHelpCard = () => {
    try {
        const btnDontKnow = document.getElementById('btn-dont-know');
        if (btnDontKnow && btnDontKnow.classList.contains('hidden')) return;

        const item = chosen[curIdx];
        if (!item) return;

        window.aggiornaCombo(false); // COMBO DOWN!
        kanjiSbagliati.push(item.k); // SALVA IN "DA RIPASSARE"

        const helpCard = document.getElementById('help-card');
        const helpText = document.getElementById('help-text');
        const inputEl = document.getElementById('quiz-input');

        if (inputEl) {
            inputEl.blur();
            inputEl.disabled = true;
        }

        let msg = "";
        if (mode === 'lettura' || mode === 'review') {
            msg = `Il carattere <span style="font-size:1.8rem; font-family:var(--font-jp); font-weight:800; color:var(--primary);">${item.k}</span> si legge <strong>${item.r}</strong>.<br><br>Significato: <em>${item.s}</em>`;
        } else {
            msg = `La traduzione di <span style="font-size:1.8rem; font-family:var(--font-jp); font-weight:800; color:var(--primary);">${item.k}</span> (${item.r}) è <strong>${item.s}</strong>.`;
        }

        if (helpText) helpText.innerHTML = msg;
        if (helpCard) {
            helpCard.classList.remove('hidden');
            helpCard.style.display = 'block';
        }
        if (btnDontKnow) btnDontKnow.classList.add('hidden');

        if (!userData.errors) userData.errors = [];
        if (!_errHas(userData.errors, item.k)) {
            userData.errors.push({k: item.k, r: item.r, s: item.s});
            if (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) {
                updateDoc(doc(db, "users", currentUser.uid), {errors: userData.errors}).catch(console.error);
                if (typeof updateErrorUI === 'function') updateErrorUI();
            }
        }
    } catch (error) {
        console.error("Errore salvato:", error);
        nextQ();
    }
};

// Chiude la card e passa alla prossima domanda
window.closeHelpAndNext = () => {
    document.getElementById('help-card').classList.add('hidden');
    document.getElementById('btn-dont-know').classList.remove('hidden');
    document.getElementById('quiz-input').disabled = false;
    
    // Passiamo alla prossima domanda (curIdx aumenta dentro nextQ)
    nextQ();
};

// --- 1. IL CERVELLO DELLA COMBO E DEGLI AIUTI ---

window.aggiornaCombo = (corretta) => {
    // Trova il combo display nella view attualmente visibile
    let comboEl = null;
    const allCombos = document.querySelectorAll('.combo-display');
    for (const el of allCombos) {
        if (!el.closest('.center-wrapper')?.classList.contains('hidden')) {
            comboEl = el;
            break;
        }
    }
    if (!comboEl) comboEl = document.getElementById('combo-text');
    if (!comboEl) return;
    
    if (corretta) {
        comboAttuale++;
        if (comboAttuale > comboMassima) comboMassima = comboAttuale;
        
        if (comboAttuale > 1) {
            comboEl.innerHTML = "Combo x" + comboAttuale + " " + "<svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" stroke=\"#f97316\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z\"></path></svg>";
            comboEl.classList.remove('combo-active');
            void comboEl.offsetWidth; // Riavvia l'animazione CSS
            comboEl.classList.add('combo-active');
        }
    } else {
        comboAttuale = 0;
        comboEl.innerText = "";
    }
};

window.usaAiutino = () => {
    if(!chosen || chosen.length === 0 || !chosen[curIdx]) return;
    const item = chosen[curIdx];

    window.aggiornaCombo(false); // Rompe la combo
    aiutiUsati++;
    kanjiSbagliati.push(item.k); // Salva per il ripasso finale

    // Genera l'aiuto in base a cosa stai studiando
    let hint = "";
    if (mode === 'lettura' || mode === 'review') {
        // Se c'è un significato lungo (Kanji/Vocaboli), mostra l'inizio
        if (item.s.length > 5) {
            hint = "Significa: " + item.s.substring(0, 4) + "...";
        } else {
            hint = "Inizia con: " + item.r.substring(0, 1) + "...";
        }
    } else {
        hint = "Inizia con: " + item.r.substring(0, 1) + "...";
    }

    const fb = document.getElementById('feedback');
    fb.innerHTML = "Aiutino " + "<svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" stroke=\"currentColor\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\"></path><circle cx=\"12\" cy=\"12\" r=\"3\"></circle></svg>" + ": " + hint;
    fb.className = "feedback";
    fb.style.color = "var(--primary)";
};


// --- FIX DEFINITIVO FINE QUIZ E RESET ---

// 2. La nuova schermata riassuntiva "Antiproiettile"
window.mostraRiassunto = () => {
    try {
        // Passa alla schermata risultati esistente (infallibile)
        showView('view-result');
        
        // Calcolo punteggio sicuro
        const finalScore = (typeof score !== 'undefined') ? score : 0;
        const total = (typeof totalInitial !== 'undefined' && totalInitial > 0) ? totalInitial : 1;
        const finalPercentage = Math.round((finalScore / total) * 100);
        
        // Protezione array errori e combo
        const errori = (typeof kanjiSbagliati !== 'undefined' && kanjiSbagliati) ? kanjiSbagliati : [];
        const combo = (typeof comboMassima !== 'undefined') ? comboMassima : 0;
        
        // Crea l'HTML per i kanji sbagliati
        let htmlErrori = "";
        if (errori.length === 0) {
            htmlErrori = "<div style='color: var(--accent-vocab); font-weight:bold; width:100%; text-align:center; display:flex; align-items:center; justify-content:center; gap:8px;'>Percorso netto! Perfetto. " + "<svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" stroke=\"#f59e0b\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z\"></path><path d=\"M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4\"></path></svg>" + "</div>";
        } else {
            // Rimuove i doppioni
            let erroriUnici = [...new Set(errori)];
            htmlErrori = erroriUnici.map(k => `<div style="background:var(--bg-body); padding:10px 15px; border-radius:10px; border:1px solid var(--border); font-family:var(--font-jp); font-size:1.5rem; font-weight:bold;">${k}</div>`).join('');
        }

        // Inietta il nuovo layout stupendo direttamente dentro la vecchia schermata!
        const resultDiv = document.getElementById('view-result');
        resultDiv.innerHTML = `
            <div style="text-align:center; max-width:600px; margin:0 auto; width:100%;">
                <div style="margin-bottom:10px; display:flex; justify-content:center;"><svg viewBox="0 0 24 24" width="56" height="56" stroke="#10b981" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="8 12 11 15 16 9"></polyline></svg></div>
                <h1 style="font-size:2.5rem; margin:0; color:var(--text-main);">Sessione Completata!</h1>
                <p style="color:var(--text-sub); margin-top:10px;">Ecco com'è andata:</p>
                
                <div style="font-size:5rem; font-weight:800; color:var(--primary); margin:20px 0; text-shadow:0 5px 20px rgba(79, 70, 229, 0.2);">
                    ${finalPercentage}%
                </div>
                
                <div style="background:var(--bg-card); padding:20px; border-radius:15px; border:1px solid var(--border); margin-bottom:30px; text-align:left; box-shadow:0 10px 20px rgba(0,0,0,0.05);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid var(--border);">
                        <span style="color:var(--text-sub); font-weight:600;">Risposte Giuste</span>
                        <span style="font-weight:bold; color:#10b981; display:inline-flex; align-items:center; gap:4px;">${finalScore} / ${total} <svg viewBox="0 0 24 24" width="16" height="16" stroke="#10b981" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="8 12 11 15 16 9"></polyline></svg></span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid var(--border);">
                        <span style="color:var(--text-sub); font-weight:600;">Risposte Sbagliate</span>
                        <span style="font-weight:bold; color:#ef4444; display:inline-flex; align-items:center; gap:4px;">${total - finalScore} / ${total} <svg viewBox="0 0 24 24" width="16" height="16" stroke="#ef4444" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg></span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                        <span style="color:var(--text-sub); font-weight:600;">Combo Massima</span>
                        <span style="font-weight:bold; color:#f97316; display:inline-flex; align-items:center; gap:4px;">${combo} <svg viewBox="0 0 24 24" width="16" height="16" stroke="#f97316" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg></span>
                    </div>

                    <h3 style="margin-top:0; margin-bottom: 10px; color:var(--text-main); font-size:1rem; text-transform:uppercase;">Da ripassare:</h3>
                    <div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center;">
                        ${htmlErrori}
                    </div>
                </div>
                
                <button class="btn-primary" onclick="showView(window._quizReturnView || 'view-home')" style="width:100%; padding:15px;">Torna all'Esercizio ➔</button>
            </div>
        `;

        window.currentFreeQuizCategory = null;
    } catch(e) {
        console.error("Errore nel mostrare il riassunto:", e);
        showView(window._quizReturnView || 'view-home');
    }
};

// Questo pezzo di codice "aggancia" la funzione al bottone
document.addEventListener("DOMContentLoaded", () => {
    const loginBtn = document.getElementById("btn-login-action");
    
    if (loginBtn) {
        loginBtn.addEventListener("click", performLogin);
    }
});

window.closeVocab = () => {
    document.getElementById('vocab-popup').classList.add('hidden');
};


window.mostraVocabolo = (parola, significato) => {
        if (window.currentReadingMode === 'hard') return;

        let testoFinale = significato;

        if (window.currentReadingMode === 'medium') {
            testoFinale = significato.replace(/\s*[\(（][^\)）]*[\)）]/g, '');
        }

        // FIX: Memorizza la parola per poterla aggiungere ai mazzi!
        window.currentVocabToAdd = window.parseVocabString(parola, significato);

        document.getElementById('vocab-word').innerText = parola;
        document.getElementById('vocab-meaning').innerText = testoFinale; 
        document.getElementById('vocab-popup').classList.remove('hidden');
    };

// Chiude il modale e salva la preferenza se la spunta è attiva
window.closeKeyboardTutorial = () => {
    const checkbox = document.getElementById('hide-tutorial-checkbox');
    if (checkbox.checked) {
        localStorage.setItem('hideKeyboardTutorial', 'true');
    }
    document.getElementById('keyboard-tutorial-modal').classList.add('hidden');
};

window.openReadingModeTutorial = () => {
    document.getElementById('reading-tutorial-modal').classList.remove('hidden');
};

window.closeReadingModeTutorial = () => {
    const checkbox = document.getElementById('hide-reading-tutorial-checkbox');
    if (checkbox.checked) {
        localStorage.setItem('hideReadingTutorial', 'true');
    }
    document.getElementById('reading-tutorial-modal').classList.add('hidden');
};

// Impostazione base: si parte dalla modalità facile
window.currentReadingMode = 'easy';

window.setReadingMode = (mode) => {
    window.currentReadingMode = mode;
    
    // 1. Gestione estetica dei bottoni
    const btnEasy = document.getElementById('btn-mode-easy');
    const btnMedium = document.getElementById('btn-mode-medium');
    const btnHard = document.getElementById('btn-mode-hard');
    
    // Resetta tutti i bottoni a "spenti" (sfondo trasparente, testo colorato)
    btnEasy.style.background = 'transparent'; btnEasy.style.color = '#10b981';
    btnMedium.style.background = 'transparent'; btnMedium.style.color = '#f59e0b';
    btnHard.style.background = 'transparent'; btnHard.style.color = '#ef4444';
    
    // Accendi quello attivo (sfondo pieno, testo bianco)
    if (mode === 'easy') { btnEasy.style.background = '#10b981'; btnEasy.style.color = 'white'; }
    if (mode === 'medium') { btnMedium.style.background = '#f59e0b'; btnMedium.style.color = 'white'; }
    if (mode === 'hard') { btnHard.style.background = '#ef4444'; btnHard.style.color = 'white'; }

    // 2. Applica la classe al contenitore del testo
    // IMPORTANTE: Sostituisci 'id-del-tuo-contenitore' con l'ID reale del div dove fai apparire le frasi (es. 'tab-giapponese' o 'reading-text')
    const textContainer = document.getElementById('reading-display'); 
    if (textContainer) {
        if (mode === 'hard') {
            textContainer.classList.add('modalita-nativa');
        } else {
            textContainer.classList.remove('modalita-nativa');
        }
    }
};


// ==========================================
// FIX: MENU KANJI MULTI-SELEZIONE
// ==========================================

// Inizializza una "memoria" temporanea per le categorie selezionate
window.tempSelectedKanjiCats = [];

window.openModernKanjiSelector = () => {
    // Svuota la memoria ogni volta che si apre il menù
    window.tempSelectedKanjiCats = [];

    const overlay = document.createElement('div');
    overlay.id = 'modern-kanji-modal';
    overlay.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); backdrop-filter:blur(5px); z-index:9999; display:flex; justify-content:center; align-items:center; opacity:0; transition:0.2s;";

    const box = document.createElement('div');
    box.style = "background:var(--bg-card); padding:30px 20px; border-radius:20px; width:90%; max-width:400px; box-shadow:0 10px 30px rgba(0,0,0,0.5); transform:scale(0.8); transition:0.2s; border:1px solid var(--border); display:flex; flex-direction:column; align-items:center;";

    let html = `
        <div style="font-size: 2.5rem; color: #ef4444; margin-bottom: 5px;">字</div>
        <h2 style="margin: 0 0 5px 0; color: var(--text-main); font-size: 1.5rem;">Kanji Mix</h2>
        <p style="color: var(--text-sub); margin: 0 0 20px 0; font-size: 0.95rem;">Seleziona uno o più livelli JLPT</p>
    `;

    html += `<div style="width: 100%; display: flex; flex-direction: column; gap: 10px; max-height: 50vh; overflow-y: auto; padding-right: 5px;">`;

    const categorie = [
        { id: "n5", nome: "N5", sub: `${n5Kanji.length} kanji` },
        { id: "n4", nome: "N4", sub: `${n4Kanji.length} kanji` },
        { id: "n3", nome: "N3", sub: `${n3Kanji.length} kanji` },
        { id: "n2", nome: "N2", sub: "380 kanji" },
        { id: "n1", nome: "N1", sub: "1136 kanji" }
    ];

    // Crea le card con lo stile identico ai Kana (tutto colorato e testo bianco)
    categorie.forEach(cat => {
        html += `
            <button id="cat-btn-${cat.id}" 
                 onclick="window.toggleKanjiCat('${cat.id}', '${cat.nome}')" 
                 onmouseover="if(!window.tempSelectedKanjiCats.find(c => c.id === '${cat.id}')) { this.style.background='#ef4444'; this.style.borderColor='#ef4444'; this.children[0].style.color='white'; this.children[1].style.color='white'; this.children[2].style.color='white'; }" 
                 onmouseout="if(!window.tempSelectedKanjiCats.find(c => c.id === '${cat.id}')) { this.style.background='var(--bg-body)'; this.style.borderColor='var(--border)'; this.children[0].style.color='var(--text-main)'; this.children[1].style.color='var(--text-sub)'; this.children[2].style.color='var(--text-sub)'; }" 
                 style="display:flex; justify-content:space-between; align-items:center; width:100%; padding:15px 18px; border-radius:12px; background:var(--bg-body); border:1px solid var(--border); cursor:pointer; transition:all 0.2s ease;">
                <span style="font-weight:bold; color:var(--text-main); font-size:1.1rem; width: 35%; text-align:left; pointer-events:none; transition:0.2s;">${cat.nome}</span>
                <span style="color:var(--text-sub); font-size:0.85rem; flex:1; text-align:left; pointer-events:none; transition:0.2s;">${cat.sub}</span>
                <span style="color:var(--text-sub); pointer-events:none; transition:0.2s;">➔</span>
            </button>
        `;
    });

    html += `</div>`;

    html += `
        <div style="display:flex; gap:10px; width:100%; margin-top:25px;">
            <button onclick="document.getElementById('modern-kanji-modal').remove()" style="flex:1; padding:12px; background:transparent; border:2px solid var(--border); border-radius:12px; color:var(--text-main); font-weight:bold; cursor:pointer; transition:0.2s;">Annulla</button>
            <button onclick="window.confermaKanjiMulti()" style="flex:1; padding:12px; background:#ef4444; border:none; border-radius:12px; color:white; font-weight:bold; cursor:pointer; transition:0.2s; box-shadow:0 5px 15px rgba(239, 68, 68, 0.3);">Avanti ➔</button>
        </div>
        <button onclick="window.openKanjiTheory()" style="width:100%; margin-top:10px; padding:11px; background:transparent; border:1px solid var(--border); border-radius:12px; color:var(--text-sub); font-weight:600; cursor:pointer; font-size:0.9rem; transition:0.2s;" onmouseover="this.style.borderColor='#c8a850'; this.style.color='#c8a850';" onmouseout="this.style.borderColor='var(--border)'; this.style.color='var(--text-sub)';">📖 Studia la Teoria Kanji</button>
    `;

    box.innerHTML = html;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    setTimeout(() => { overlay.style.opacity = '1'; box.style.transform = 'scale(1)'; }, 10);
};

// ==================== TEORIA KANJI ====================
window.openKanjiTheory = () => {
    const modal = document.getElementById('modern-kanji-modal');
    if (modal) modal.remove();
    showView('view-kanji-theory');
    window.renderKanjiTheoryGrid('n5');
    const search = document.getElementById('kanji-theory-search');
    if (search) { search.value = ''; }
};

window._currentTheoryLevel = 'n5';

window.renderKanjiTheoryGrid = (level) => {
    window._currentTheoryLevel = level;
    const detailMap = { n5: window.n5KanjiDetail, n4: window.n4KanjiDetail, n3: window.n3KanjiDetail };
    const data = detailMap[level] || null;
    // aggiorna stili tab
    ['n5','n4','n3'].forEach(l => {
        const btn = document.getElementById('kt-tab-' + l);
        if (!btn) return;
        const active = l === level;
        btn.style.background = active ? '#E11D48' : 'transparent';
        btn.style.color = active ? 'white' : 'var(--text-sub)';
    });
    const grid = document.getElementById('kanji-theory-grid');
    if (!grid) return;
    if (!data) {
        grid.innerHTML = '<p style="color:var(--text-sub); text-align:center; grid-column:1/-1; padding:40px;">Prossimamente!</p>';
        return;
    }
    const allReadings = e => [...e.on, ...e.kun].join(' ');
    grid.innerHTML = data.map(e => `
        <div onclick="window.openKanjiDetail('${e.k}')"
             data-kanji="${e.k}"
             data-meaning="${e.m.join(' ')}"
             data-reading="${allReadings(e)}"
             style="aspect-ratio:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px;
                    background:var(--bg-card); border-radius:14px; border:1px solid var(--border); cursor:pointer;
                    transition:all 0.18s; user-select:none; padding:4px;"
             onmouseover="this.style.borderColor='#E11D48'; this.style.transform='translateY(-3px)'; this.style.boxShadow='0 8px 20px rgba(225,29,72,0.2)';"
             onmouseout="this.style.borderColor='var(--border)'; this.style.transform=''; this.style.boxShadow='';">
            <div style="font-size:2.2rem; font-family:var(--font-jp); font-weight:bold; color:var(--text-main); line-height:1;">${e.k}</div>
            <div style="font-size:0.62rem; color:var(--text-sub); text-align:center; padding:0 2px; line-height:1.2;">${e.m[0]}</div>
        </div>
    `).join('');
};

window.openKanjiDetail = (char) => {
    const cards = document.querySelectorAll('#kanji-theory-grid [data-kanji]');
    const visible = [];
    cards.forEach(c => { if (c.style.opacity !== '0.2') visible.push(c.dataset.kanji); });
    const lvl = window._currentTheoryLevel || 'n5';
    const detailList = (lvl === 'n4' ? window.n4KanjiDetail : lvl === 'n3' ? window.n3KanjiDetail : window.n5KanjiDetail) || [];
    window._kanjiDetailList = visible.length ? visible : detailList.map(e => e.k);
    window._kanjiDetailIdx = window._kanjiDetailList.indexOf(char);
    if (window._kanjiDetailIdx === -1) window._kanjiDetailIdx = 0;
    window._showKanjiDetailAt(window._kanjiDetailIdx);
};

window._showKanjiDetailAt = (idx) => {
    const list = window._kanjiDetailList || [];
    if (!list.length) return;
    window._kanjiDetailIdx = Math.max(0, Math.min(idx, list.length - 1));
    const e = (window._allKanjiDetailMap || {})[list[window._kanjiDetailIdx]];
    if (!e) return;
    document.getElementById('kd-char').textContent = e.k;
    document.getElementById('kd-meanings').textContent = e.m.join(' · ');
    document.getElementById('kd-on').textContent = e.on.length ? e.on.join(' · ') : '—';
    document.getElementById('kd-kun').textContent = e.kun.length ? e.kun.join(' · ') : '—';
    document.getElementById('kd-counter').textContent = `${window._kanjiDetailIdx + 1} / ${list.length}`;
    const prevBtn = document.getElementById('kd-prev');
    const nextBtn = document.getElementById('kd-next');
    if (prevBtn) prevBtn.style.opacity = window._kanjiDetailIdx === 0 ? '0.35' : '1';
    if (nextBtn) nextBtn.style.opacity = window._kanjiDetailIdx === list.length - 1 ? '0.35' : '1';
    document.getElementById('kanji-detail-overlay').classList.remove('hidden');
};

window.prevKanjiDetail = () => { window._showKanjiDetailAt((window._kanjiDetailIdx || 0) - 1); };
window.nextKanjiDetail = () => { window._showKanjiDetailAt((window._kanjiDetailIdx || 0) + 1); };

window.closeKanjiDetail = () => {
    document.getElementById('kanji-detail-overlay').classList.add('hidden');
};

document.addEventListener('keydown', (ev) => {
    if (document.getElementById('kanji-detail-overlay')?.classList.contains('hidden')) return;
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); window.prevKanjiDetail(); }
    if (ev.key === 'ArrowRight') { ev.preventDefault(); window.nextKanjiDetail(); }
    if (ev.key === 'Escape') window.closeKanjiDetail();
});

((() => {
    let _swipeX = null;
    document.addEventListener('touchstart', (ev) => {
        if (document.getElementById('kanji-detail-overlay')?.classList.contains('hidden')) return;
        _swipeX = ev.touches[0].clientX;
    }, { passive: true });
    document.addEventListener('touchend', (ev) => {
        if (document.getElementById('kanji-detail-overlay')?.classList.contains('hidden') || _swipeX === null) return;
        const dx = ev.changedTouches[0].clientX - _swipeX;
        _swipeX = null;
        if (Math.abs(dx) < 50) return;
        if (dx < 0) window.nextKanjiDetail();
        else window.prevKanjiDetail();
    }, { passive: true });
})());

window.searchKanjiTheory = (query) => {
    const q = query.trim().toLowerCase();
    const cards = document.querySelectorAll('#kanji-theory-grid [data-kanji]');
    if (!q) {
        cards.forEach(c => c.style.opacity = '1');
        return;
    }
    let firstMatch = null;
    cards.forEach(c => {
        const k = c.dataset.kanji.toLowerCase();
        const m = c.dataset.meaning.toLowerCase();
        const r = c.dataset.reading.toLowerCase();
        const match = k.includes(q) || m.includes(q) || r.includes(q);
        c.style.opacity = match ? '1' : '0.2';
        if (match && !firstMatch) firstMatch = c;
    });
    if (firstMatch) firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
};
// ==================== FINE TEORIA KANJI ====================

// Logica di Toggle (seleziona / deseleziona)
window.toggleKanjiCat = (catId, catName) => {
    const btn = document.getElementById(`cat-btn-${catId}`);
    const index = window.tempSelectedKanjiCats.findIndex(c => c.id === catId);

    if (index > -1) {
        // DESELEZIONA: Rimuove dall'array e ripristina lo stile spento
        window.tempSelectedKanjiCats.splice(index, 1);
        btn.style.background = 'var(--bg-body)';
        btn.style.borderColor = 'var(--border)';
        btn.children[0].style.color = 'var(--text-main)';
        btn.children[1].style.color = 'var(--text-sub)';
        btn.children[2].style.color = 'var(--text-sub)';
    } else {
        // SELEZIONA: Aggiunge all'array e applica lo stile acceso (rosso e bianco)
        window.tempSelectedKanjiCats.push({ id: catId, name: catName });
        btn.style.background = '#ef4444';
        btn.style.borderColor = '#ef4444';
        btn.children[0].style.color = 'white';
        btn.children[1].style.color = 'white';
        btn.children[2].style.color = 'white';
    }
};

window.confermaKanjiMulti = (fromRestore = false) => {
    if (!fromRestore) {
        if (window.tempSelectedKanjiCats.length === 0) {
            window.showToast("Seleziona almeno una categoria per continuare!", true);
            return;
        }
        document.getElementById('modern-kanji-modal').remove();
    }

    sessionStorage.setItem('lastSelectionCtx', JSON.stringify({ type: 'kanji', cats: window.tempSelectedKanjiCats }));

    let combinedKanji = [];
    let combinedNames = [];

    const levelMap = { n5: n5Kanji, n4: n4Kanji, n3: n3Kanji, n2: n2Kanji, n1: n1Kanji };
    window.tempSelectedKanjiCats.forEach(cat => {
        if (levelMap[cat.id]) {
            combinedKanji = combinedKanji.concat(levelMap[cat.id]);
            combinedNames.push(cat.name);
        }
    });

    const uniqueKanji = [];
    const seenKeys = new Set();
    combinedKanji.forEach(item => {
        if (!seenKeys.has(item.k)) {
            seenKeys.add(item.k);
            uniqueKanji.push(item);
        }
    });

    currentDB = [...uniqueKanji];
    chosen = []; // FIX: Ora parte con 0 elementi selezionati!
    window._kanjiQuickFilter = null;
    mode = 'lettura';

    comboAttuale = 0;
    comboMassima = 0;
    kanjiSbagliati = [];
    window._quizReturnView = 'view-selection';

    const titleEl = document.getElementById('sel-title');
    let titleText = "Mix Kanji";
    if (combinedNames.length === 1) titleText = "Kanji: " + combinedNames[0];
    else if (combinedNames.length <= 3) titleText = combinedNames.join(" + ");
    if (titleEl) titleEl.innerText = titleText;

    window.showView('view-selection');

    const container = document.getElementById('chip-container');
    if (container) {
        container.innerHTML = '';
        currentDB.forEach(item => {
            const el = document.createElement('div');
            el.className = 'chip' + (userData.learned?.includes(item.k) ? ' learned' : '');
            el.innerText = item.k;

            el.onclick = () => {
                el.classList.toggle('selected');
                const p = chosen.indexOf(item);
                if(p > -1) chosen.splice(p, 1);
                else chosen.push(item);
            };
            container.appendChild(el);
        });
    }

    // FIX: Testo corretto all'avvio
    const btnAll = document.querySelector('#view-selection div[onclick="toggleSelectAll()"]');
    if(btnAll) btnAll.innerText = "Seleziona Tutto";

    const tradRow = document.getElementById('traduzione-toggle-row');
    if (tradRow) tradRow.style.display = 'block';
    const chkTrad = document.getElementById('chk-traduzioni');
    if (chkTrad) chkTrad.checked = false;
    window._tradMode = false;
};


window.selectedAdjLevel = 'cortese';
window.selectedAdjForms = ['pres'];
window.adjDrillCount = 10;
window.showFuriganaAdj = true;

let adjDrillQueue = [];
let currentAdjIdx = 0;
let currentAdjObj = null;
let currentAdjTargetForm = "";
let correctAdjConjugation = "";



window.openAdjSetup = () => { showView('view-adj-setup'); };

window.selectAdjMacroForm = (level, btn) => {
    document.querySelectorAll('.btn-macro-adj').forEach(b => {
        b.style.background = 'var(--bg-body)';
        b.style.color = 'var(--text-main)';
        b.style.borderColor = 'var(--border)';
    });
    btn.style.background = '#ec4899';
    btn.style.color = 'white';
    btn.style.borderColor = '#ec4899';
    window.selectedAdjLevel = level;
};

window.toggleAdjForm = (form, chip) => {
    chip.classList.toggle('selected');
    const idx = window.selectedAdjForms.indexOf(form);
    if (idx > -1) window.selectedAdjForms.splice(idx, 1);
    else window.selectedAdjForms.push(form);
};

window.setAdjCount = (el, count) => {
    const container = document.getElementById('adj-count-container');
    container.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    window.adjDrillCount = count;
};

window.toggleFuriganaAdj = () => {
    window.showFuriganaAdj = !window.showFuriganaAdj;
    const btn = document.getElementById('btn-furigana-adj');
    if(btn) {
        btn.innerText = window.showFuriganaAdj ? "Furigana: ON" : "Furigana: OFF";
        btn.style.background = window.showFuriganaAdj ? "#ec4899" : "transparent";
        btn.style.color = window.showFuriganaAdj ? "white" : "var(--text-sub)";
        btn.style.border = "1px solid " + (window.showFuriganaAdj ? "#ec4899" : "var(--border)");
    }
    if(!document.getElementById('view-adj-quiz').classList.contains('hidden') && currentAdjObj) {
        const currentInput = document.getElementById('adj-answer-input').value;
        renderAdjQuestion();
        document.getElementById('adj-answer-input').value = currentInput;
    }
};

// Funzione fondamentale che capisce se è in I o in NA e calcola i suffissi
function getAdjConjugation(v, level, form) {
    // Escludiamo avverbi dalla lista se presenti
    if (v.r === 'とても' || v.r === 'たくさん') return { k: v.k, r: v.r, type: 'adv', exp: '' };

    // Capisce se è I-Adj (finisce in い ma NON è una delle eccezioni な)
    const exceptionsNA = ['きれい', 'きらい', 'とくい', 'べんり', 'げんき', 'すき', 'じょうず', 'へた', 'にぎやか', 'ふべん', 'にがて'];
    let isIAdj = v.r.endsWith('い') && !exceptionsNA.includes(v.r);
    
    let rootK = v.k; let rootR = v.r;
    let isYoi = (v.k === '良い' || v.r === 'いい'); // L'eccezione 良い
    
    if (isIAdj) {
        rootK = isYoi ? '良' : v.k.slice(0, -1);
        rootR = isYoi ? 'よ' : v.r.slice(0, -1);
    }

    let resK = "", resR = "", exp = "";

    if (isIAdj) {
        if (form === 'pres') {
            resK = v.k + (level === 'cortese' ? 'です' : '');
            resR = v.r + (level === 'cortese' ? 'です' : '');
            exp = level === 'cortese' ? `Aggiungi です a fine frase.` : `Resta identico nella forma piana.`;
        } else if (form === 'neg') {
            resK = rootK + 'くない' + (level === 'cortese' ? 'です' : '');
            resR = rootR + 'くない' + (level === 'cortese' ? 'です' : '');
            exp = isYoi ? `Eccezione 良い: diventa よくない!` : `Togli い e aggiungi くない${level === 'cortese' ? 'です' : ''}.`;
        } else if (form === 'past') {
            resK = rootK + 'かった' + (level === 'cortese' ? 'です' : '');
            resR = rootR + 'かった' + (level === 'cortese' ? 'です' : '');
            exp = isYoi ? `Eccezione 良い: diventa よかった!` : `Togli い e aggiungi かった${level === 'cortese' ? 'です' : ''}.`;
        } else if (form === 'past_neg') {
            resK = rootK + 'くなかった' + (level === 'cortese' ? 'です' : '');
            resR = rootR + 'くなかった' + (level === 'cortese' ? 'です' : '');
            exp = isYoi ? `Eccezione 良い: diventa よくなかった!` : `Togli い e aggiungi くなかった${level === 'cortese' ? 'です' : ''}.`;
        }
    } else { // NA-Adj
        if (form === 'pres') {
            resK = v.k + (level === 'cortese' ? 'です' : 'だ');
            resR = v.r + (level === 'cortese' ? 'です' : 'だ');
            exp = level === 'cortese' ? `Aggiungi です alla fine.` : `Aggiungi だ al posto di です.`;
        } else if (form === 'neg') {
            resK = v.k + (level === 'cortese' ? 'じゃありません' : 'じゃない');
            resR = v.r + (level === 'cortese' ? 'じゃありません' : 'じゃない');
            exp = level === 'cortese' ? `Usa じゃありません.` : `Usa じゃない.`;
        } else if (form === 'past') {
            resK = v.k + (level === 'cortese' ? 'でした' : 'だった');
            resR = v.r + (level === 'cortese' ? 'でした' : 'だった');
            exp = level === 'cortese' ? `Usa でした.` : `Usa だった.`;
        } else if (form === 'past_neg') {
            resK = v.k + (level === 'cortese' ? 'じゃありませんでした' : 'じゃなかった');
            resR = v.r + (level === 'cortese' ? 'じゃありませんでした' : 'じゃなかった');
            exp = level === 'cortese' ? `Usa じゃありませんでした.` : `Usa じゃなかった.`;
        }
    }
    return { k: resK, r: resR, type: isIAdj ? 'i' : 'na', exp: exp };
}

window.initAdjDrill = () => {
    if(window.selectedAdjForms.length === 0) return alert("Seleziona almeno un tempo!");
    
    // Filtriamo gli avverbi fuori dall'allenamento
    let validAdjs = adjData.filter(a => a.r !== 'とても' && a.r !== 'たくさん');
    let shuffled = [...validAdjs].sort(() => 0.5 - Math.random());
    let limit = window.adjDrillCount === 'all' ? shuffled.length : Math.min(window.adjDrillCount, shuffled.length);
    
    adjDrillQueue = [];
    for(let i=0; i<limit; i++) {
        let randomForm = window.selectedAdjForms[Math.floor(Math.random() * window.selectedAdjForms.length)];
        adjDrillQueue.push({ adj: shuffled[i], form: randomForm });
    }
    
    totalInitial = adjDrillQueue.length;
    score = 0; comboAttuale = 0; comboMassima = 0; kanjiSbagliati = [];
    currentAdjIdx = 0;
    window.currentFreeQuizCategory = 'aggettivi';
    window._quizReturnView = 'view-adj-setup';
    showView('view-adj-quiz');
    window.checkSectionTutorial?.('adj-quiz');
    renderAdjQuestion();
};

window.renderAdjQuestion = () => {
    document.getElementById('adj-feedback-box').classList.add('hidden');
    document.getElementById('adj-check-btn').classList.remove('hidden');
    
    let q = adjDrillQueue[currentAdjIdx];
    currentAdjObj = q.adj;
    currentAdjTargetForm = q.form;
    
    let calc = getAdjConjugation(currentAdjObj, window.selectedAdjLevel, currentAdjTargetForm);
    correctAdjConjugation = calc.k;
    window.correctAdjConjugationKana = calc.r; 
    window.currentAdjExplanation = `<b>Aggettivo in ${calc.type === 'i' ? 'い' : 'な'}:</b> ${calc.exp} (Soluzione: ${correctAdjConjugation})`;

    document.getElementById('adj-progress').innerText = `${currentAdjIdx + 1} / ${adjDrillQueue.length}`;
    document.getElementById('adj-progress-bar').style.width = `${((currentAdjIdx + 1) / adjDrillQueue.length) * 100}%`;
    document.getElementById('adj-target-form').innerText = `${adjFormNames[currentAdjTargetForm]} (${window.selectedAdjLevel === 'cortese' ? 'Cortese' : 'Piana'})`;
    
    if (window.showFuriganaAdj) {
        document.getElementById('adj-kanji-display').innerHTML = `<ruby>${currentAdjObj.k}<rt style="font-size: 0.4em; color: #ec4899; font-weight: 700; margin-bottom: 5px;">${currentAdjObj.r}</rt></ruby>`;
    } else {
        document.getElementById('adj-kanji-display').innerHTML = currentAdjObj.k;
    }
    document.getElementById('adj-meaning-display').innerText = currentAdjObj.s;
    
    let inputEl = document.getElementById('adj-answer-input');
    inputEl.value = ""; inputEl.focus();
};

window.checkAdjAnswer = () => {
    let input = document.getElementById('adj-answer-input').value.trim();
    if(input === "") return;

    // Tolleriamo じゃありません e ではありません
    let isCorrect = (input === correctAdjConjugation || input === window.correctAdjConjugationKana);
    if (!isCorrect && input.includes('では')) {
        let altK = correctAdjConjugation.replace('じゃ', 'では');
        let altR = window.correctAdjConjugationKana.replace('じゃ', 'では');
        if (input === altK || input === altR) isCorrect = true;
    }

    if(isCorrect) {
        if(typeof playGameSound === 'function') playGameSound('ok');
        window.aggiornaCombo(true); 
        if(document.getElementById('adj-feedback-box').classList.contains('hidden')) score++;
        nextAdjQuestion();
    } else {
        if(typeof playGameSound === 'function') playGameSound('no');
        window.aggiornaCombo(false); 
        if(!kanjiSbagliati.includes(currentAdjObj.k)) kanjiSbagliati.push(currentAdjObj.k);

        document.getElementById('adj-check-btn').classList.add('hidden');
        let box = document.getElementById('adj-feedback-box');
        document.getElementById('adj-feedback-text').innerHTML = window.currentAdjExplanation;
        box.classList.remove('hidden');
    }
};

window.nextAdjQuestion = () => {
    currentAdjIdx++;
    if(currentAdjIdx >= adjDrillQueue.length) window.mostraRiassunto();
    else renderAdjQuestion();
};

document.getElementById('adj-answer-input').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        if (document.getElementById('adj-feedback-box').classList.contains('hidden')) checkAdjAnswer();
        else nextAdjQuestion();
    }
});
document.getElementById('adj-answer-input').oninput = function() {
    this.value = toHiragana(this.value.toLowerCase());
};

// ==========================================
// FIX: MENU CLASSIFICATORI MULTI-SELEZIONE
// ==========================================

window.tempSelectedCounterCats = [];

window.openModernCounterSelector = () => {
    // Svuota la memoria ogni volta che si apre il menù
    window.tempSelectedCounterCats = [];

    const overlay = document.createElement('div');
    overlay.id = 'modern-counter-modal';
    overlay.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); backdrop-filter:blur(5px); z-index:9999; display:flex; justify-content:center; align-items:center; opacity:0; transition:0.2s;";

    const box = document.createElement('div');
    box.style = "background:var(--bg-card); padding:30px 20px; border-radius:20px; width:90%; max-width:400px; box-shadow:0 10px 30px rgba(0,0,0,0.5); transform:scale(0.8); transition:0.2s; border:1px solid var(--border); display:flex; flex-direction:column; align-items:center;";

    let html = `
        <div style="font-size: 2.5rem; color: #7C3AED; margin-bottom: 5px;">文</div>
        <h2 style="margin: 0 0 5px 0; color: var(--text-main); font-size: 1.5rem;">Mix Classificatori</h2>
        <p style="color: var(--text-sub); margin: 0 0 20px 0; font-size: 0.95rem;">Seleziona una o più categorie</p>
    `;

    html += `<div style="width: 100%; display: flex; flex-direction: column; gap: 10px; max-height: 50vh; overflow-y: auto; padding-right: 5px;">`;

    // Le tue categorie dei classificatori
    const categorie = [
        { id: 'generic', nome: 'Generici', sub: 'つ' },
        { id: 'people', nome: 'Persone', sub: '人' },
        { id: 'days', nome: 'Giorni', sub: '日' },
        { id: 'time', nome: 'Ore', sub: '時' },
        { id: 'months', nome: 'Mesi', sub: '月' },
        { id: 'flat', nome: 'Piatti', sub: '枚' },
        { id: 'long', nome: 'Lunghi', sub: '本' },
        { id: 'books', nome: 'Libri', sub: '冊' },
        { id: 'animals', nome: 'Animali', sub: '匹' },
        { id: 'machines', nome: 'Macchine', sub: '台' },
        { id: 'small', nome: 'Piccoli', sub: '個' }
    ];

    // Crea le card con lo stile compatto e il colore viola (#7C3AED)
    categorie.forEach(cat => {
        html += `
            <button id="counter-btn-${cat.id}" 
                 onclick="window.toggleCounterCat('${cat.id}', '${cat.nome}')" 
                 onmouseover="if(!window.tempSelectedCounterCats.find(c => c.id === '${cat.id}')) { this.style.background='#7C3AED'; this.style.borderColor='#7C3AED'; this.children[0].style.color='white'; this.children[1].style.color='white'; this.children[2].style.color='white'; }" 
                 onmouseout="if(!window.tempSelectedCounterCats.find(c => c.id === '${cat.id}')) { this.style.background='var(--bg-body)'; this.style.borderColor='var(--border)'; this.children[0].style.color='var(--text-main)'; this.children[1].style.color='var(--text-sub)'; this.children[2].style.color='var(--text-sub)'; }" 
                 style="display:flex; justify-content:space-between; align-items:center; width:100%; padding:15px 18px; border-radius:12px; background:var(--bg-body); border:1px solid var(--border); cursor:pointer; transition:all 0.2s ease;">
                <span style="font-weight:bold; color:var(--text-main); font-size:1.1rem; width: 40%; text-align:left; pointer-events:none; transition:0.2s;">${cat.nome}</span>
                <span style="color:var(--text-sub); font-size:0.85rem; flex:1; text-align:left; pointer-events:none; transition:0.2s;">(${cat.sub})</span>
                <span style="color:var(--text-sub); pointer-events:none; transition:0.2s;">➔</span>
            </button>
        `;
    });

    html += `</div>`;

    html += `
        <div style="display:flex; gap:10px; width:100%; margin-top:25px;">
            <button onclick="document.getElementById('modern-counter-modal').remove()" style="flex:1; padding:12px; background:transparent; border:2px solid var(--border); border-radius:12px; color:var(--text-main); font-weight:bold; cursor:pointer; transition:0.2s;">Annulla</button>
            <button onclick="window.confermaCounterMulti()" style="flex:1; padding:12px; background:#7C3AED; border:none; border-radius:12px; color:white; font-weight:bold; cursor:pointer; transition:0.2s; box-shadow:0 5px 15px rgba(124, 58, 237, 0.3);">Avanti ➔</button>
        </div>
    `;

    box.innerHTML = html;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    setTimeout(() => { overlay.style.opacity = '1'; box.style.transform = 'scale(1)'; }, 10);
};

// Logica di Toggle (seleziona / deseleziona) per i classificatori
window.toggleCounterCat = (catId, catName) => {
    const btn = document.getElementById(`counter-btn-${catId}`);
    const index = window.tempSelectedCounterCats.findIndex(c => c.id === catId);

    if (index > -1) {
        // DESELEZIONA
        window.tempSelectedCounterCats.splice(index, 1);
        btn.style.background = 'var(--bg-body)';
        btn.style.borderColor = 'var(--border)';
        btn.children[0].style.color = 'var(--text-main)';
        btn.children[1].style.color = 'var(--text-sub)';
        btn.children[2].style.color = 'var(--text-sub)';
    } else {
        // SELEZIONA
        window.tempSelectedCounterCats.push({ id: catId, name: catName });
        btn.style.background = '#7C3AED';
        btn.style.borderColor = '#7C3AED';
        btn.children[0].style.color = 'white';
        btn.children[1].style.color = 'white';
        btn.children[2].style.color = 'white';
    }
};

// Genera la schermata di selezione chip (Tutti spenti all'avvio)
window.confermaCounterMulti = () => {
    if (window.tempSelectedCounterCats.length === 0) {
        window.showToast("Seleziona almeno una categoria per continuare!", true);
        return;
    }

    document.getElementById('modern-counter-modal').remove();

    let combinedCounters = [];
    let combinedNames = [];

    window.tempSelectedCounterCats.forEach(cat => {
        if (countersData[cat.id]) {
            combinedCounters = combinedCounters.concat(countersData[cat.id]);
            combinedNames.push(cat.name);
        }
    });

    const uniqueCounters = [];
    const seenKeys = new Set();
    combinedCounters.forEach(item => {
        if (!seenKeys.has(item.k)) {
            seenKeys.add(item.k);
            uniqueCounters.push(item);
        }
    });

    currentDB = [...uniqueCounters];
    chosen = []; // Tutti i chip partono DESELEZIONATI
    mode = 'lettura';

    comboAttuale = 0;
    comboMassima = 0;
    kanjiSbagliati = [];
    window._quizReturnView = 'view-selection';

    const titleEl = document.getElementById('sel-title');
    let titleText = "Mix Classificatori";
    if (combinedNames.length === 1) titleText = "Classificatori: " + combinedNames[0];
    else if (combinedNames.length <= 3) titleText = combinedNames.join(" + ");
    if (titleEl) titleEl.innerText = titleText;

    window.showView('view-selection');

    const container = document.getElementById('chip-container');
    if (container) {
        container.innerHTML = '';
        currentDB.forEach(item => {
            const el = document.createElement('div');
            el.className = 'chip'; // Senza 'selected'
            el.innerText = item.k; 
            
            el.onclick = () => { 
                el.classList.toggle('selected'); 
                const p = chosen.indexOf(item); 
                if(p > -1) chosen.splice(p, 1); 
                else chosen.push(item); 
            };
            container.appendChild(el);
        });
    }

    const btnAll = document.querySelector('#view-selection div[onclick="toggleSelectAll()"]');
    if(btnAll) btnAll.innerText = "Seleziona Tutto";
};


window.tempSelectedKanaCats = [];

window.openModernKanaSelector = () => {
    window.tempSelectedKanaCats = [];

    const overlay = document.createElement('div');
    overlay.id = 'modern-kana-modal';
    overlay.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); backdrop-filter:blur(5px); z-index:9999; display:flex; justify-content:center; align-items:center; opacity:0; transition:0.2s;";

    const box = document.createElement('div');
    box.style = "background:var(--bg-card); padding:30px 20px; border-radius:20px; width:90%; max-width:400px; box-shadow:0 10px 30px rgba(0,0,0,0.5); transform:scale(0.8); transition:0.2s; border:1px solid var(--border); display:flex; flex-direction:column; align-items:center;";

    let html = `
        <div style="font-size: 2.5rem; color: #D97706; margin-bottom: 5px;">あ</div>
        <h2 style="margin: 0 0 5px 0; color: var(--text-main); font-size: 1.5rem;">Mix Kana</h2>
        <p style="color: var(--text-sub); margin: 0 0 20px 0; font-size: 0.95rem;">Seleziona uno o entrambi gli alfabeti</p>
    `;

    html += `<div style="width: 100%; display: flex; flex-direction: column; gap: 10px; max-height: 50vh; overflow-y: auto; padding-right: 5px;">`;

    const categorie = [
        { id: "hiragana", nome: "Hiragana", sub: "Sillabario Base" },
        { id: "katakana", nome: "Katakana", sub: "Parole Straniere" }
    ];

    categorie.forEach(cat => {
        html += `
            <button id="kana-btn-${cat.id}" 
                 onclick="window.toggleKanaCat('${cat.id}', '${cat.nome}')" 
                 onmouseover="if(!window.tempSelectedKanaCats.find(c => c.id === '${cat.id}')) { this.style.background='#D97706'; this.style.borderColor='#D97706'; this.children[0].style.color='white'; this.children[1].style.color='white'; this.children[2].style.color='white'; }" 
                 onmouseout="if(!window.tempSelectedKanaCats.find(c => c.id === '${cat.id}')) { this.style.background='var(--bg-body)'; this.style.borderColor='var(--border)'; this.children[0].style.color='var(--text-main)'; this.children[1].style.color='var(--text-sub)'; this.children[2].style.color='var(--text-sub)'; }" 
                 style="display:flex; justify-content:space-between; align-items:center; width:100%; padding:15px 18px; border-radius:12px; background:var(--bg-body); border:1px solid var(--border); cursor:pointer; transition:all 0.2s ease;">
                <span style="font-weight:bold; color:var(--text-main); font-size:1.1rem; width: 40%; text-align:left; pointer-events:none; transition:0.2s;">${cat.nome}</span>
                <span style="color:var(--text-sub); font-size:0.85rem; flex:1; text-align:left; pointer-events:none; transition:0.2s;">${cat.sub}</span>
                <span style="color:var(--text-sub); pointer-events:none; transition:0.2s;">➔</span>
            </button>
        `;
    });

    html += `</div>`;

    html += `
        <div style="display:flex; gap:10px; width:100%; margin-top:25px;">
            <button onclick="document.getElementById('modern-kana-modal').remove()" style="flex:1; padding:12px; background:transparent; border:2px solid var(--border); border-radius:12px; color:var(--text-main); font-weight:bold; cursor:pointer; transition:0.2s;">Annulla</button>
            <button onclick="window.confermaKanaMulti()" style="flex:1; padding:12px; background:#D97706; border:none; border-radius:12px; color:white; font-weight:bold; cursor:pointer; transition:0.2s; box-shadow:0 5px 15px rgba(217, 119, 6, 0.3);">Avanti ➔</button>
        </div>
    `;

    box.innerHTML = html;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    setTimeout(() => { overlay.style.opacity = '1'; box.style.transform = 'scale(1)'; }, 10);
};

window.toggleKanaCat = (catId, catName) => {
    const btn = document.getElementById(`kana-btn-${catId}`);
    const index = window.tempSelectedKanaCats.findIndex(c => c.id === catId);

    if (index > -1) {
        window.tempSelectedKanaCats.splice(index, 1);
        btn.style.background = 'var(--bg-body)';
        btn.style.borderColor = 'var(--border)';
        btn.children[0].style.color = 'var(--text-main)';
        btn.children[1].style.color = 'var(--text-sub)';
        btn.children[2].style.color = 'var(--text-sub)';
    } else {
        window.tempSelectedKanaCats.push({ id: catId, name: catName });
        btn.style.background = '#D97706';
        btn.style.borderColor = '#D97706';
        btn.children[0].style.color = 'white';
        btn.children[1].style.color = 'white';
        btn.children[2].style.color = 'white';
    }
};

window.confermaKanaMulti = (fromRestore = false) => {
    if (!fromRestore) {
        if (window.tempSelectedKanaCats.length === 0) {
            window.showToast("Seleziona almeno un alfabeto per continuare!", true);
            return;
        }
        document.getElementById('modern-kana-modal').remove();
    }

    sessionStorage.setItem('lastSelectionCtx', JSON.stringify({ type: 'kana', cats: window.tempSelectedKanaCats }));

    let combinedKana = [];
    let combinedNames = [];

    window.tempSelectedKanaCats.forEach(cat => {
        if (cat.id === 'hiragana') combinedKana = combinedKana.concat(hiraData);
        else if (cat.id === 'katakana') combinedKana = combinedKana.concat(kataData);
        
        combinedNames.push(cat.name);
    });

    currentDB = [...combinedKana];
    chosen = []; // Tutto deselezionato all'avvio
    mode = 'romaji';

    comboAttuale = 0;
    comboMassima = 0;
    kanjiSbagliati = [];
    window._quizReturnView = 'view-selection';

    const titleEl = document.getElementById('sel-title');
    let titleText = "Mix Kana";
    if (combinedNames.length === 1) titleText = combinedNames[0];
    else if (combinedNames.length <= 3) titleText = combinedNames.join(" + ");
    if (titleEl) titleEl.innerText = titleText;

    window.showView('view-selection');

    const tradRowKana = document.getElementById('traduzione-toggle-row');
    if (tradRowKana) tradRowKana.style.display = 'none';
    window._tradMode = false;

    // Mantiene la struttura di divisione per riga
    const c = document.getElementById('chip-container');
    c.innerHTML = '';

    const groups = {
        "Vocali": ["あ", "い", "う", "え", "お", "ア", "イ", "ウ", "エ", "オ"],
        "Riga K": ["か", "き", "く", "け", "こ", "カ", "キ", "ク", "ケ", "コ"],
        "Riga S": ["さ", "し", "す", "せ", "そ", "サ", "シ", "ス", "セ", "ソ"],
        "Riga T": ["た", "ち", "つ", "て", "と", "タ", "チ", "ツ", "テ", "ト"],
        "Riga N": ["な", "に", "ぬ", "ね", "の", "ナ", "ニ", "ヌ", "ネ", "ノ"],
        "Riga H": ["は", "ひ", "ふ", "へ", "ほ", "ハ", "ヒ", "フ", "ヘ", "ホ"],
        "Riga M": ["ま", "み", "む", "め", "も", "マ", "ミ", "ム", "メ", "モ"],
        "Riga Y": ["や", "ゆ", "よ", "ヤ", "ユ", "ヨ"],
        "Riga R": ["ら", "り", "る", "れ", "ろ", "ラ", "リ", "ル", "レ", "ロ"],
        "Riga W / N": ["わ", "を", "ん", "ワ", "ヲ", "ン"],
        "Dakuten (゛/ ゜)": ["が", "ぎ", "ぐ", "げ", "ご", "ざ", "じ", "ず", "ぜ", "ぞ", "だ", "ぢ", "づ", "で", "ど", "ば", "び", "ぶ", "べ", "ぼ", "ぱ", "ぴ", "ぷ", "ぺ", "ぽ", "ガ", "ギ", "グ", "ゲ", "ゴ", "ザ", "ジ", "ズ", "ゼ", "ゾ", "ダ", "ヂ", "ヅ", "デ", "ド", "バ", "ビ", "ブ", "ベ", "ボ", "パ", "ピ", "プ", "ペ", "ポ"],
        "Contratti (Ya/Yu/Yo)": ["きゃ", "きゅ", "きょ", "しゃ", "しゅ", "しょ", "ちゃ", "ちゅ", "ちょ", "にゃ", "にゅ", "にょ", "ひゃ", "ひゅ", "ひょ", "みゃ", "みゅ", "みょ", "りゃ", "りゅ", "りょ", "ぎゃ", "ぎゅ", "ぎょ", "じゃ", "じゅ", "じょ", "びゃ", "びゅ", "びょ", "ぴゃ", "ぴゅ", "ぴょ", "キャ", "キュ", "キョ", "シャ", "シュ", "ショ", "チャ", "チュ", "チョ", "ニャ", "ニュ", "ニョ", "ヒャ", "ヒュ", "ヒョ", "ミャ", "ミュ", "ミョ", "リャ", "リュ", "リョ", "ギャ", "ギュ", "ギョ", "ジャ", "ジュ", "ジョ", "ビャ", "ビュ", "ビョ", "ピャ", "ピュ", "ピョ"]
    };

    for (let gName in groups) {
        // Filtra i kana del DB misto
        const filtered = currentDB.filter(item => groups[gName].includes(item.k));
        
        if(filtered.length > 0) {
            const title = document.createElement('div');
            title.style = "width:100%; margin-top:20px; margin-bottom:10px; font-weight:800; color:var(--primary); font-size:0.9rem; text-transform:uppercase; border-bottom:1px solid var(--border); padding-bottom:5px; display:flex; justify-content:space-between; cursor:pointer;";
            title.innerHTML = `<span>${gName}</span> <span style="font-size:0.75rem; color:var(--text-sub); text-transform:none;">(Seleziona riga)</span>`;
            c.appendChild(title);

            let rowChips = [];
            
            title.onclick = () => {
                let allSelected = rowChips.every(chip => chip.classList.contains('selected'));
                rowChips.forEach(chip => {
                    if (allSelected) {
                        chip.classList.remove('selected');
                        const p = chosen.indexOf(chip.itemData);
                        if (p > -1) chosen.splice(p, 1);
                    } else {
                        if (!chip.classList.contains('selected')) {
                            chip.classList.add('selected');
                            chosen.push(chip.itemData);
                        }
                    }
                });
            };

            filtered.forEach(item => {
                const el = document.createElement('div');
                el.className = 'chip'; 
                el.innerText = item.k;
                
                el.itemData = item;
                rowChips.push(el);

                el.onclick = () => {
                    el.classList.toggle('selected');
                    const p = chosen.indexOf(item);
                    if(p > -1) chosen.splice(p, 1);
                    else chosen.push(item);
                };
                c.appendChild(el);
            });
        }
    }

    const btnAll = document.querySelector('#view-selection div[onclick="toggleSelectAll()"]');
    if(btnAll) btnAll.innerText = "Seleziona Tutto";
};

// ==========================================
// MOTORE ESERCIZI PARTICELLE
// ==========================================

window.selectedParticleLvl = 'facile';
window.particleDrillCount = 10;
let particleQueue = [];
let currentPartIdx = 0;
let particleScore = 0;

// Database delle frasi. I Kanji usano la classe "theory-clickable" per aprire il popup!


window.openParticleSetup = () => { showView('view-particle-setup'); };

window.selectParticleLvl = (lvl, btn) => {
    document.querySelectorAll('.btn-macro-part').forEach(b => {
        b.style.background = 'var(--bg-body)';
        b.style.color = 'var(--text-main)';
        b.style.borderColor = 'var(--border)';
    });
    btn.style.background = '#7C3AED';
    btn.style.color = 'white';
    btn.style.borderColor = '#7C3AED';
    window.selectedParticleLvl = lvl;
};

window.setParticleCount = (el, count) => {
    const container = document.getElementById('particle-count-container');
    container.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    window.particleDrillCount = count;
};

window.showFuriganaParticle = true;

window.toggleFuriganaParticle = () => {
    window.showFuriganaParticle = !window.showFuriganaParticle;
    const btn = document.getElementById('btn-furigana-particle');
    if (btn) {
        btn.textContent = window.showFuriganaParticle ? 'Furigana: ON' : 'Furigana: OFF';
        btn.style.background = window.showFuriganaParticle ? '#7C3AED' : 'transparent';
        btn.style.color = window.showFuriganaParticle ? 'white' : 'var(--text-sub)';
        btn.style.border = '2px solid ' + (window.showFuriganaParticle ? '#7C3AED' : 'var(--border)');
    }
    const sentenceEl = document.getElementById('part-sentence-display');
    if (sentenceEl) {
        sentenceEl.classList.toggle('hide-furigana', !window.showFuriganaParticle);
    }
};

window.initParticleDrill = () => {
    window.currentFreeQuizCategory = null;
    // Filtra per livello e mescola
    let validParts = particlesData.filter(p => p.lvl === window.selectedParticleLvl);
    
    // Fallback: se non ci sono abbastanza frasi, prendile da altri livelli
    if(validParts.length === 0) validParts = [...particlesData]; 
    
    let shuffled = [...validParts].sort(() => 0.5 - Math.random());
    let limit = window.particleDrillCount === 'all' ? shuffled.length : Math.min(window.particleDrillCount, shuffled.length);
    
    particleQueue = shuffled.slice(0, limit);
    
    totalInitial = particleQueue.length;
    particleScore = 0;
    currentPartIdx = 0;
    comboAttuale = 0;
    comboMassima = 0;
    kanjiSbagliati = [];
    window._quizReturnView = 'view-particle-setup';
    showView('view-particle-quiz');
    window.checkSectionTutorial?.('particle-quiz');
    renderParticleQuestion();
};

window.renderParticleQuestion = () => {
    let q = particleQueue[currentPartIdx];
    
    // Aggiorna contatori in alto
    document.getElementById('part-progress-text').innerText = `Domanda ${currentPartIdx + 1} di ${totalInitial}`;
    document.getElementById('part-score-text').innerText = `Score: ${particleScore}/${totalInitial}`;
    
    let pct = Math.round((currentPartIdx / totalInitial) * 100);
    document.getElementById('part-progress-bar').style.width = pct + "%";

    // Resetta interfaccia bottoni e feedback
    document.getElementById('part-feedback-box').classList.add('hidden');
    document.getElementById('part-next-btn').classList.add('hidden');
    
    // Inserisci testo e traduzione
    const sentenceEl = document.getElementById('part-sentence-display');
    sentenceEl.innerHTML = q.sentence;
    sentenceEl.classList.toggle('hide-furigana', !window.showFuriganaParticle);
    document.getElementById('part-translation-display').innerText = q.translation;

    // Crea i bottoni dinamicamente
    const optionsContainer = document.getElementById('part-options');
    optionsContainer.innerHTML = '';
    
    // Mischia le opzioni
    let shuffledOptions = [...q.options].sort(() => 0.5 - Math.random());
    
    shuffledOptions.forEach(opt => {
        let btn = document.createElement('button');
        btn.innerText = opt;
        btn.style = "padding: 15px; font-size: 1.5rem; font-weight: bold; border-radius: 12px; background: var(--bg-body); color: var(--text-main); border: 2px solid var(--border); cursor: pointer; transition: 0.2s;";
        
        // Hover effect
        btn.onmouseover = () => { if(!btn.disabled) btn.style.background = "var(--border)"; };
        btn.onmouseout = () => { if(!btn.disabled) btn.style.background = "var(--bg-body)"; };
        
        btn.onclick = () => window.checkParticleAnswer(opt, btn, q.answer, q.explanation);
        optionsContainer.appendChild(btn);
    });
};

window.checkParticleAnswer = (selectedOpt, btnElement, correctOpt, explanation) => {
    // Disabilita tutti i bottoni
    const allBtns = document.getElementById('part-options').querySelectorAll('button');
    allBtns.forEach(b => {
        b.disabled = true;
        b.style.cursor = 'default';
        b.style.opacity = '0.7';
    });

    const feedbackBox = document.getElementById('part-feedback-box');
    const feedbackTitle = document.getElementById('part-feedback-title');
    const feedbackText = document.getElementById('part-feedback-text');

    if (selectedOpt === correctOpt) {
        // CORRETTO (Verde)
        btnElement.classList.add('part-option-correct');

        particleScore++;
        window.aggiornaCombo(true);
        if(typeof playGameSound === 'function') playGameSound('ok');

        feedbackBox.classList.remove('feedback-wrong');
        feedbackBox.classList.add('feedback-correct');
        feedbackTitle.innerText = "Corretto!";
        feedbackText.innerHTML = `La particella corretta è <b>${correctOpt}</b>. <br><br> ${explanation}`;
    } else {
        // SBAGLIATO (Rosso, ed evidenzia quello corretto)
        btnElement.classList.add('part-option-wrong');

        window.aggiornaCombo(false);
        if(typeof playGameSound === 'function') playGameSound('no');

        // Evidenzia la risposta corretta
        allBtns.forEach(b => {
            if (b.innerText === correctOpt) {
                b.classList.add('part-option-reveal');
            }
        });

        feedbackBox.classList.remove('feedback-correct');
        feedbackBox.classList.add('feedback-wrong');
        feedbackTitle.innerText = "Sbagliato!";
        feedbackText.innerHTML = `La particella corretta era: <b>${correctOpt}</b>. <br><br> ${explanation}`;
    }

    // Aggiorna lo score a schermo
    document.getElementById('part-score-text').innerText = `Score: ${particleScore}/${totalInitial}`;

    feedbackBox.classList.remove('hidden');
    document.getElementById('part-next-btn').classList.remove('hidden');
};

window.nextParticleQuestion = () => {
    currentPartIdx++;
    if(currentPartIdx >= particleQueue.length) {
        // Passa i dati al riassunto generale!
        score = particleScore;
        totalInitial = particleQueue.length;
        kanjiSbagliati = [];
        window.mostraRiassunto();
    } else {
        renderParticleQuestion();
    }
};


// ==========================================
// SEZIONE COMMUNITY (REDDIT-STYLE)
// ==========================================

let unsubscribeCommunityFeed = null;
let unsubscribeComments = null;
let currentOpenPostId = null;

// --- LOGICA FEED COMMUNITY (Mondiale vs Seguiti) ---

window.currentCommunityTab = 'mondiale'; // Tab attiva di default
window.allCommunityPosts = []; // Memoria per salvare tutti i post di Firebase

window.switchCommunityTab = (tab) => {
    window.currentCommunityTab = tab;
    // Evidenzia la tab giusta
    document.getElementById('tab-feed-mondiale').classList.toggle('active', tab === 'mondiale');
    document.getElementById('tab-feed-seguiti').classList.toggle('active', tab === 'seguiti');
    window.renderCommunityFeed(); // Ridisegna i post
};

window.showCommunity = () => {
    showView('view-community');
    
    const q = query(collection(db, "communityPosts"), orderBy("createdAt", "desc"));
    if (unsubscribeCommunityFeed) unsubscribeCommunityFeed();
    
    unsubscribeCommunityFeed = onSnapshot(q, (snapshot) => {
        window.allCommunityPosts = [];
        snapshot.forEach(docSnap => {
            let p = docSnap.data();
            p.id = docSnap.id;
            window.allCommunityPosts.push(p);
        });
        window.renderCommunityFeed();
    });
};

window.renderCommunityFeed = () => {
    const feed = document.getElementById('community-feed');
    if (!feed) return;
    
    let filteredPosts = [];

    if (window.currentCommunityTab === 'mondiale') {
        // MONDIALE: Mostra solo i post PUBBLICI (esclude quelli 'solo amici' di altre persone)
        filteredPosts = window.allCommunityPosts.filter(p => p.visibility !== 'friends' || p.authorId === currentUser.uid);
    } else {
        // SEGUITI: Mostra tutti i post (sia pubblici che privati) dei TUOI AMICI + i TUOI
        filteredPosts = window.allCommunityPosts.filter(p => 
            (userData.friends && userData.friends.includes(p.authorId)) || 
            p.authorId === currentUser.uid
        );
    }

    if (filteredPosts.length === 0) {
        feed.innerHTML = '<div style="text-align:center; color:var(--text-sub); padding:30px;">Nessun post da mostrare qui.</div>';
        return;
    }

    let feedHTML = '';
    let avatarsToFetch = [];

    filteredPosts.forEach(post => {
        const postId = post.id;
        const likesCount = post.likes ? post.likes.length : 0;
        const isLiked = post.likes && post.likes.includes(currentUser.uid);
        avatarsToFetch.push({ uid: post.authorId, elId: `dyn-avatar-${postId}` });

        // Targhetta carina se il post è riservato solo agli amici
        const visBadge = post.visibility === 'friends' ? `<span style="background:rgba(16, 185, 129, 0.15); color:#10b981; padding:2px 8px; border-radius:8px; font-size:0.7rem; font-weight:bold; margin-left:8px;"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg> Solo Amici</span>` : '';

        feedHTML += `
            <div style="background:var(--bg-body); border-radius:15px; padding:20px; border:1px solid var(--border); margin-bottom:15px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <div style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="viewFriendProfile('${post.authorId}')">
                        <div id="dyn-avatar-${postId}" style="font-size:2rem; background:var(--bg-card); width:45px; height:45px; display:flex; justify-content:center; align-items:center; border-radius:50%; box-shadow:0 2px 10px rgba(0,0,0,0.1);">${post.authorAvatar || '👤'}</div>
                        <div>
                            <div style="font-weight:bold; color:var(--text-main); font-size:1rem;">${post.authorName}</div>
                            <div style="font-size:0.75rem; color:var(--text-sub); display:flex; align-items:center;">
                                ${post.createdAt ? new Date(post.createdAt.toDate()).toLocaleDateString('it-IT', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : 'Ora'}
                                ${visBadge}
                            </div>
                        </div>
                    </div>
                    ${post.authorId === currentUser.uid ? `<button onclick="deletePost('${postId}')" style="background:transparent; border:none; color:#ef4444; cursor:pointer; font-size:1.2rem;"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg></button>` : ''}
                </div>
                
                ${post.imageUrl ? `<div style="margin-bottom:15px; border-radius:12px; overflow:hidden; border:1px solid var(--border); background:var(--bg-card);"><img src="${post.imageUrl}" onclick="openImageView('${post.imageUrl}', event)" style="width:100%; max-height:400px; object-fit:cover; display:block; cursor:pointer; transition:0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'"></div>` : ''}
                
                <div style="color:var(--text-main); font-size:1.05rem; line-height:1.5; margin-bottom:20px; white-space:pre-wrap;">${post.content}</div>
                
                <div style="display:flex; gap:15px; border-top:1px solid var(--border); padding-top:15px;">
                    <button onclick="toggleLike('${postId}', ${isLiked})" style="background:${isLiked ? '#FEE2E2' : 'var(--bg-card)'}; color:${isLiked ? '#ef4444' : 'var(--text-sub)'}; border:1px solid ${isLiked ? '#ef4444' : 'var(--border)'}; padding:8px 15px; border-radius:50px; cursor:pointer; font-weight:bold; transition:0.2s; display:flex; align-items:center; gap:5px;">
                        ${isLiked ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="#ef4444" stroke-width="2" fill="#ef4444"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>' : '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>'} ${likesCount}
                    </button>
                    <button onclick="openPostDetail('${postId}')" style="background:var(--bg-card); color:var(--text-sub); border:1px solid var(--border); padding:8px 15px; border-radius:50px; cursor:pointer; font-weight:bold; transition:0.2s; display:flex; align-items:center; gap:5px;">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> ${post.commentCount || 0}
                    </button>
                </div>
            </div>
        `;
    });
    
    feed.innerHTML = feedHTML;
    avatarsToFetch.forEach(a => window.loadRealtimeAvatar(a.uid, a.elId));
};

// Crea un nuovo post (ora supporta immagini e privacy!)
window.createPost = async () => {
    const contentInput = document.getElementById('new-post-content');
    const content = contentInput.value.trim();
    const fileInput = document.getElementById('post-image-input');
    const file = fileInput ? fileInput.files[0] : null;
    const visibility = document.getElementById('post-visibility').value; // <-- LEGGE LA TENDINA
    
    if (!content && !file) return window.showToast("Scrivi qualcosa o carica una foto!", true);
    
    try {
        let imageUrl = null;
        if (file) {
            window.showToast("Caricamento immagine in corso...");
            const storageRef = ref(storage, 'posts/' + Date.now() + "_" + file.name);
            await uploadBytes(storageRef, file);
            imageUrl = await getDownloadURL(storageRef);
        }

        await addDoc(collection(db, "communityPosts"), {
            authorId: currentUser.uid,
            authorName: userData.username,
            authorAvatar: userData.avatar,
            content: content,
            imageUrl: imageUrl, 
            visibility: visibility, // <-- SALVA LA SCELTA (public o friends)
            createdAt: serverTimestamp(),
            likes: [],
            commentCount: 0
        });
        
        contentInput.value = ''; 
        if(fileInput) fileInput.value = ''; 
        window.removeImagePreview(); 
        window.showToast("Post pubblicato con successo!");
    } catch(e) {
        console.error(e);
        window.showToast("Errore durante la pubblicazione.", true);
    }
};

// Metti o togli Mi Piace
window.toggleLike = async (postId, isLiked) => {
    const postRef = doc(db, "communityPosts", postId);
    try {
        if (isLiked) {
            await updateDoc(postRef, { likes: arrayRemove(currentUser.uid) });
        } else {
            await updateDoc(postRef, { likes: arrayUnion(currentUser.uid) });
            
            // --- INVIO NOTIFICA ---
            const snap = await getDoc(postRef);
            if (snap.exists()) {
                const authorId = snap.data().authorId;
                // Manda la notifica solo se il post NON è il tuo!
                if (authorId !== currentUser.uid) {
                    await addDoc(collection(db, "notifications"), {
                        type: "post_like",
                        from: currentUser.uid,
                        fromName: userData.username,
                        fromAvatar: userData.avatar,
                        to: authorId,
                        postId: postId,
                        status: "unread",
                        createdAt: serverTimestamp()
                    });
                }
            }
        }
    } catch(e) { console.error("Errore Like:", e); }
};

// Elimina Post (se sei l'autore)
window.deletePost = async (postId) => {
    window.showCustomConfirm("Sei sicuro di voler eliminare questo post?", async () => {
        try {
            await deleteDoc(doc(db, "communityPosts", postId));
            window.showToast("Post eliminato!");
        } catch(e) {
            console.error(e);
        }
    });
};

window.openPostDetail = async (postId) => {
    currentOpenPostId = postId;
    document.getElementById('modal-post-detail').classList.remove('hidden');
    
    const commentsContainer = document.getElementById('post-detail-content');
    commentsContainer.innerHTML = '<div style="text-align:center; color:var(--text-sub); margin-top:20px;">Caricamento...</div>';
    
    // 1. SCARICA IL POST ORIGINALE (Per mostrarlo in cima al modal!)
    let mainPostHTML = '';
    try {
        const postSnap = await getDoc(doc(db, "communityPosts", postId));
        if (postSnap.exists()) {
            const post = postSnap.data();
            mainPostHTML = `
                <div style="padding-bottom:20px; border-bottom:2px solid var(--border); margin-bottom:20px;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
                        <div style="font-size:2rem; background:var(--bg-body); width:45px; height:45px; display:flex; justify-content:center; align-items:center; border-radius:50%; box-shadow:0 2px 10px rgba(0,0,0,0.1);">${post.authorAvatar || '👤'}</div>
                        <div>
                            <div style="font-weight:bold; color:var(--text-main); font-size:1rem;">${post.authorName}</div>
                            <div style="font-size:0.75rem; color:var(--text-sub);">${post.createdAt ? new Date(post.createdAt.toDate()).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}) : ''}</div>
                        </div>
                    </div>
                    ${post.imageUrl ? `<div style="margin-bottom:15px; border-radius:12px; overflow:hidden; border:1px solid var(--border); background:var(--bg-card);"><img src="${post.imageUrl}" onclick="openImageView('${post.imageUrl}', event)" style="width:100%; max-height:400px; object-fit:cover; display:block; cursor:pointer;"></div>` : ''}
                    <div style="color:var(--text-main); font-size:1.1rem; line-height:1.5; white-space:pre-wrap;">${post.content}</div>
                </div>
                <h4 style="color:var(--text-sub); margin-bottom:15px; text-transform:uppercase; font-size:0.85rem;">Risposte</h4>
            `;
        }
    } catch(e) { console.error("Errore post principale", e); }

    // 2. Ascolta i commenti in tempo reale!
    const q = query(collection(db, "communityPosts", postId, "comments"), orderBy("createdAt", "asc"));
    
    if (unsubscribeComments) unsubscribeComments();
    
    unsubscribeComments = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            commentsContainer.innerHTML = mainPostHTML + '<div style="text-align:center; color:var(--text-sub); margin-top:20px;">Nessun commento. Scrivi per primo!</div>';
            return;
        }

        let mainComments = [];
        let replies = {};
        let avatarsToFetch = [];
        let finalHTML = mainPostHTML; // <--- Inizia stampando il post originale!

        snapshot.forEach(docSnap => {
            const c = docSnap.data();
            c.id = docSnap.id;
            if (c.parentId) {
                if (!replies[c.parentId]) replies[c.parentId] = [];
                replies[c.parentId].push(c);
            } else {
                mainComments.push(c);
            }
        });

        mainComments.forEach(comment => {
            const commentId = comment.id;
            const likesCount = comment.likes ? comment.likes.length : 0;
            const isLiked = comment.likes && comment.likes.includes(currentUser.uid);
            
            const isMe = comment.authorId === currentUser.uid;
            const isFriend = userData.friends && userData.friends.includes(comment.authorId);
            let addFriendHTML = (!isMe && !isFriend) ? `<div onclick="sendFriendRequestDirect('${comment.authorId}', event)" style="position:absolute; bottom:-5px; right:-5px; background:var(--primary); color:white; border-radius:50%; width:16px; height:16px; display:flex; justify-content:center; align-items:center; font-size:12px; font-weight:bold; border:2px solid var(--bg-body); cursor:pointer;" title="Aggiungi agli amici">+</div>` : '';

            avatarsToFetch.push({ uid: comment.authorId, elId: `dyn-com-${commentId}` });

            const commentReplies = replies[commentId] || [];
            let repliesHTML = '';
            let toggleRepliesBtn = '';

            if (commentReplies.length > 0) {
                toggleRepliesBtn = `<div onclick="document.getElementById('replies-${commentId}').classList.toggle('hidden')" style="cursor:pointer; color:var(--text-sub); font-size:0.85rem; font-weight:bold; margin-top:10px; padding-left:15px; border-left:2px solid var(--border);"> ―― Mostra/Nascondi ${commentReplies.length} risposte</div>`;
                
                repliesHTML = `<div id="replies-${commentId}" class="hidden" style="margin-top:15px; padding-left:20px; border-left:2px solid var(--border); display:flex; flex-direction:column; gap:10px;">`;
                
                commentReplies.forEach(rep => {
                    const rLikesCount = rep.likes ? rep.likes.length : 0;
                    const rIsLiked = rep.likes && rep.likes.includes(currentUser.uid);
                    
                    avatarsToFetch.push({ uid: rep.authorId, elId: `dyn-rep-${rep.id}` });

                    repliesHTML += `
                        <div style="display:flex; gap:10px;">
                            <div id="dyn-rep-${rep.id}" style="font-size:1.2rem; background:var(--bg-body); width:30px; height:30px; display:flex; justify-content:center; align-items:center; border-radius:50%; cursor:pointer; min-width:30px;" onclick="viewFriendProfile('${rep.authorId}')">${rep.authorAvatar || '👤'}</div>
                            <div style="flex:1;">
                                <div style="display:flex; align-items:baseline; gap:8px;">
                                    <span style="font-weight:bold; color:var(--text-main); font-size:0.85rem;">${rep.authorName}</span>
                                    <span style="font-size:0.7rem; color:var(--text-sub);">${rep.createdAt ? new Date(rep.createdAt.toDate()).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}) : ''}</span>
                                </div>
                                <div style="color:var(--text-main); font-size:0.9rem; white-space:pre-wrap; margin-bottom:5px;">${rep.content}</div>
                                <div style="display:flex; gap:10px; align-items:center; font-size:0.75rem;">
                                    <span onclick="toggleCommentLike('${currentOpenPostId}', '${rep.id}', ${rIsLiked})" style="cursor:pointer; color:${rIsLiked ? '#ef4444' : 'var(--text-sub)'}; font-weight:bold; transition:0.2s;">
                                        ${rIsLiked ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="#ef4444" stroke-width="2" fill="#ef4444"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>' : '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>'} ${rLikesCount}
                                    </span>
                                    <span onclick="replyToComment('${commentId}', '${rep.authorName}')" style="cursor:pointer; color:var(--text-sub); font-weight:bold; transition:0.2s;">
                                        ↩️ Rispondi
                                    </span>
                                </div>
                            </div>
                        </div>
                    `;
                });
                repliesHTML += `</div>`;
            }

            finalHTML += `
                <div style="display:flex; gap:10px; margin-bottom:20px;">
                    <div style="position:relative;">
                        <div id="dyn-com-${commentId}" style="font-size:1.8rem; background:var(--bg-body); width:40px; height:40px; display:flex; justify-content:center; align-items:center; border-radius:50%; cursor:pointer;" onclick="viewFriendProfile('${comment.authorId}')">${comment.authorAvatar || '👤'}</div>
                        ${addFriendHTML}
                    </div>
                    <div style="flex:1;">
                        <div style="background:var(--bg-body); padding:12px 15px; border-radius:0 15px 15px 15px; border:1px solid var(--border);">
                            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                <span style="font-weight:bold; color:var(--text-main); font-size:0.9rem;">${comment.authorName}</span>
                                <span style="font-size:0.75rem; color:var(--text-sub);">${comment.createdAt ? new Date(comment.createdAt.toDate()).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}) : ''}</span>
                            </div>
                            <div style="color:var(--text-main); font-size:0.95rem; white-space:pre-wrap; margin-bottom: 10px;">${comment.content}</div>
                            
                            <div style="display:flex; gap:15px; align-items:center; font-size:0.85rem;">
                                <span onclick="toggleCommentLike('${currentOpenPostId}', '${commentId}', ${isLiked})" style="cursor:pointer; color:${isLiked ? '#ef4444' : 'var(--text-sub)'}; font-weight:bold; transition:0.2s;">
                                    ${isLiked ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="#ef4444" stroke-width="2" fill="#ef4444"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>' : '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>'} ${likesCount}
                                </span>
                                <span onclick="replyToComment('${commentId}', '${comment.authorName}')" style="cursor:pointer; color:var(--text-sub); font-weight:bold; transition:0.2s;">
                                    ↩️ Rispondi
                                </span>
                            </div>
                        </div>
                        ${toggleRepliesBtn}
                        ${repliesHTML}
                    </div>
                </div>
            `;
        });
        
        commentsContainer.innerHTML = finalHTML;
        
        avatarsToFetch.forEach(a => window.loadRealtimeAvatar(a.uid, a.elId));
    });
};

window.closePostDetail = () => {
    document.getElementById('modal-post-detail').classList.add('hidden');
    currentOpenPostId = null;
    if (unsubscribeComments) {
        unsubscribeComments(); // Smetti di ascoltare per risparmiare risorse
        unsubscribeComments = null;
    }
};

window.addComment = async () => {
    if (!currentOpenPostId) return;
    const inputEl = document.getElementById('new-comment-input');
    const content = inputEl.value.trim();
    if (!content) return window.showToast("Il testo non può essere vuoto!", true);
    
    try {
        // 1. Prepariamo i dati del commento in modo sicuro
        let commentData = {
            authorId: currentUser.uid,
            authorName: userData.username,
            authorAvatar: userData.avatar,
            content: content,
            createdAt: serverTimestamp(),
            likes: []
        };
        
        // 2. Aggiungiamo l'ID genitore SOLO se stiamo effettivamente rispondendo a qualcuno
        if (typeof currentReplyParentId !== 'undefined' && currentReplyParentId) {
            commentData.parentId = currentReplyParentId;
        }

        // Salviamo il commento
        await addDoc(collection(db, "communityPosts", currentOpenPostId, "comments"), commentData);
        
        // 3. Aggiorniamo il contatore generale sul post
        const postRef = doc(db, "communityPosts", currentOpenPostId);
        const postSnap = await getDoc(postRef);
        
        if (postSnap.exists()) {
            const postData = postSnap.data();
            const currentCount = postData.commentCount || 0;
            await updateDoc(postRef, { commentCount: currentCount + 1 });
            
            // --- GESTIONE NOTIFICHE COMMENTI ---
            
            // A. Se è un commento normale, avvisa l'autore del Post
            if (postData.authorId !== currentUser.uid && !commentData.parentId) {
                await addDoc(collection(db, "notifications"), {
                    type: "comment",
                    from: currentUser.uid,
                    fromName: userData.username,
                    fromAvatar: userData.avatar,
                    to: postData.authorId,
                    postId: currentOpenPostId,
                    textSnippet: content.substring(0, 35), // Salva i primi 35 caratteri da mostrare
                    status: "unread",
                    createdAt: serverTimestamp()
                });
            }

            // B. Se è una risposta a un altro commento, avvisa l'autore del Commento
            if (commentData.parentId) {
                const parentRef = doc(db, "communityPosts", currentOpenPostId, "comments", commentData.parentId);
                const parentSnap = await getDoc(parentRef);
                if (parentSnap.exists() && parentSnap.data().authorId !== currentUser.uid) {
                    await addDoc(collection(db, "notifications"), {
                        type: "comment",
                        from: currentUser.uid,
                        fromName: userData.username,
                        fromAvatar: userData.avatar,
                        to: parentSnap.data().authorId,
                        postId: currentOpenPostId,
                        textSnippet: content.substring(0, 35),
                        status: "unread",
                        createdAt: serverTimestamp()
                    });
                }
            }
        }
        
        // 4. Pulizia e Feedback Visivo
        inputEl.value = ''; 
        if (typeof window.cancelReply === 'function') window.cancelReply(); 
        window.showToast("Commento pubblicato!"); // <-- Feedback aggiunto!
        
    } catch(e) {
        console.error("Errore nell'aggiunta del commento:", e);
        window.showToast("Errore durante l'invio del commento.", true);
    }
};

// Aggiunge o rimuove il Mi Piace a un commento specifico
window.toggleCommentLike = async (postId, commentId, isLiked) => {
    const commentRef = doc(db, "communityPosts", postId, "comments", commentId);
    try {
        if (isLiked) {
            await updateDoc(commentRef, { likes: arrayRemove(currentUser.uid) });
        } else {
            await updateDoc(commentRef, { likes: arrayUnion(currentUser.uid) });
            
            // --- INVIO NOTIFICA ---
            const snap = await getDoc(commentRef);
            if (snap.exists() && snap.data().authorId !== currentUser.uid) {
                await addDoc(collection(db, "notifications"), {
                    type: "post_like", // Usiamo la stessa estetica del like al post
                    from: currentUser.uid,
                    fromName: userData.username,
                    fromAvatar: userData.avatar,
                    to: snap.data().authorId,
                    postId: postId, // Ci serve per farti aprire la pagina corretta
                    status: "unread",
                    createdAt: serverTimestamp()
                });
            }
        }
    } catch(e) { console.error("Errore Like Commento:", e); }
};

window.replyToComment = (commentId, username) => {
    // 1. Salva l'ID del commento genitore
    currentReplyParentId = commentId; 
    
    // 2. Mostra l'indicatore di risposta sopra l'input
    const indicator = document.getElementById('reply-indicator');
    if (indicator) {
        indicator.classList.remove('hidden');
        document.getElementById('reply-username').innerText = "@" + username;
    }
    
    // 3. Prepara l'input di testo
    const inputEl = document.getElementById('new-comment-input');
    if (inputEl) {
        inputEl.placeholder = `Rispondi a ${username}...`;
        
        // Inserisce il tag in automatico solo se non c'è già
        const tag = `@${username} `;
        if (!inputEl.value.startsWith(tag)) {
            inputEl.value = tag + inputEl.value;
        }
        
        // Diamo il focus alla casella di testo
        inputEl.focus();
    }
};

window.sendFriendRequestDirect = async (targetId, event) => {
    if (event) event.stopPropagation(); 
    if (userData.friends.includes(targetId)) return window.showToast("Siete già amici!", true);
    
    try {
        const qReq = query(collection(db, "notifications"), where("from", "==", currentUser.uid), where("to", "==", targetId), where("type", "==", "friend_request"));
        const snapReq = await getDocs(qReq);
        if(!snapReq.empty) return window.showToast("Richiesta già inviata in precedenza!", true);

        await addDoc(collection(db, "notifications"), { 
            type: "friend_request",
            from: currentUser.uid, 
            fromName: userData.username, 
            fromAvatar: userData.avatar, 
            to: targetId, 
            status: "unread",
            createdAt: serverTimestamp() 
        });
        window.showToast("Richiesta di amicizia inviata!");
    } catch(e) { window.showToast("Errore nell'invio.", true); }
};

window.removeFriend = async (friendId, friendName, fromProfile = false) => {
    window.showCustomConfirm(`Vuoi davvero rimuovere ${friendName} dagli amici?`, async () => {
        try {
            const myRef = doc(db, "users", currentUser.uid);
            const friendRef = doc(db, "users", friendId);
            
            await updateDoc(myRef, { friends: arrayRemove(friendId) });
            await updateDoc(friendRef, { friends: arrayRemove(currentUser.uid) });
            
            userData.friends = userData.friends.filter(id => id !== friendId);
            window.showToast("Amicizia rimossa.");
            
            // Aggiorna la lista social se esiste
            if (typeof renderFriends === "function") renderFriends();
            
            // Se eravamo sul suo profilo, ricarica la pagina visivamente
            if (fromProfile) {
                window.viewFriendProfile(friendId);
            }
        } catch(e) {
            console.error(e);
            window.showToast("Errore durante la rimozione.", true);
        }
    });
};

window.sendFriendRequestProfile = async (targetId, btnElement) => {
    try {
        const qReq = query(collection(db, "notifications"), where("from", "==", currentUser.uid), where("to", "==", targetId), where("type", "==", "friend_request"));
        const snapReq = await getDocs(qReq);
        if(!snapReq.empty) return window.showToast("Richiesta già inviata!", true);

        await addDoc(collection(db, "notifications"), {
            type: "friend_request",
            from: currentUser.uid,
            fromName: userData.username,
            fromAvatar: userData.avatar,
            to: targetId,
            status: "unread",
            createdAt: serverTimestamp()
        });

        btnElement.innerText = "Richiesta inviata";
        btnElement.style.background = "var(--bg-body)";
        btnElement.style.color = "var(--text-main)";
        btnElement.style.border = "1px solid var(--border)";
        btnElement.onclick = null; 
        btnElement.style.cursor = "default";
        window.showToast("Richiesta inviata!");
    } catch(e) { window.showToast("Errore di connessione.", true); }
};

// --- CACHE AVATAR DINAMICI ---
const usersCache = {};

window.loadRealtimeAvatar = async (uid, elementId) => {
    // Se abbiamo già scaricato l'avatar di questo utente in questa sessione, usalo
    if (usersCache[uid]) {
        const el = document.getElementById(elementId);
        if (el) el.innerText = usersCache[uid].avatar || '👤';
        return;
    }
    // Altrimenti vallo a cercare nel database
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
            usersCache[uid] = snap.data();
            const el = document.getElementById(elementId);
            if (el) el.innerText = usersCache[uid].avatar || '👤';
        }
    } catch(e) {
        console.error("Errore recupero avatar:", e);
    }
};

// Apre l'immagine a schermo intero
window.openImageView = (url, event) => {
    if (event) event.stopPropagation(); // Evita di cliccare cose sotto l'immagine
    const modal = document.getElementById('modal-image-view');
    const img = document.getElementById('full-size-image');
    if (modal && img) {
        img.src = url;
        modal.classList.remove('hidden');
    }
};

// Chiude l'immagine a schermo intero
window.closeImageView = () => {
    const modal = document.getElementById('modal-image-view');
    if (modal) {
        modal.classList.add('hidden');
        setTimeout(() => { document.getElementById('full-size-image').src = ''; }, 200); // Pulisce dopo l'animazione
    }
};


// --- RENDERIZZA LA TUA GRIGLIA PERSONALE ---
window.myCurrentGrid = null; // Memoria per il bottone aperto

window.renderMyGrid = (type) => {
    const grid = document.getElementById('my-inventory-grid');
    const sbKanji = document.getElementById('my-sb-kanji');
    const sbKana = document.getElementById('my-sb-kana');

    // Se il bottone è già aperto, lo chiude!
    if (window.myCurrentGrid === type) {
        window.myCurrentGrid = null;
        grid.innerHTML = ''; // Svuota la griglia
        if (sbKanji) sbKanji.style.border = '1px solid var(--border)';
        if (sbKana) sbKana.style.border = '1px solid var(--border)';
        return; // Ferma la funzione qui
    }

    // Altrimenti apre la griglia richiesta
    window.myCurrentGrid = type;
    const learned = userData.learned || [];

    // Colora i bordi dei bottoni
    if (sbKanji && sbKana) {
        if (type === 'kanji') {
            sbKanji.style.border = '2px solid var(--accent-kanji)';
            sbKana.style.border = '1px solid var(--border)';
        } else {
            sbKana.style.border = '2px solid var(--accent-kana)';
            sbKanji.style.border = '1px solid var(--border)';
        }
    }

    if (type === 'kanji') {
        window._renderKanjiByLevel(learned, grid);
        return;
    }

    window._renderKanaByGroup(learned, grid);
};

window.loadMyPosts = () => {
    const postsGrid = document.getElementById('my-posts-grid');
    if(!postsGrid) return;
    
    // Forza il layout verticale stile Threads!
    postsGrid.style = "display:flex; flex-direction:column; gap:15px; margin-bottom: 20px;";
    postsGrid.innerHTML = '<div style="text-align:center; color:var(--text-sub); padding:20px;">Caricamento post...</div>';

    const qPosts = query(collection(db, "communityPosts"), where("authorId", "==", currentUser.uid));
    
    getDocs(qPosts).then(snapPosts => {
        postsGrid.innerHTML = '';
        if(snapPosts.empty) {
            postsGrid.innerHTML = '<div style="text-align:center; color:var(--text-sub); padding:20px;">Non hai ancora pubblicato nulla.</div>';
            return;
        }

        let myPosts = [];
        snapPosts.forEach(doc => { let p = doc.data(); p.id = doc.id; myPosts.push(p); });
        
        // FIX: Ordinamento sicuro
        myPosts.sort((a,b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

        myPosts.forEach(post => {
            const postId = post.id;
            const likesCount = post.likes ? post.likes.length : 0;
            const isLiked = post.likes && post.likes.includes(currentUser.uid);

            const postDiv = document.createElement('div');
            postDiv.style = "background:var(--bg-body); border-radius:15px; padding:20px; border:1px solid var(--border); position: relative; text-align: left;";
            
            const deleteBtn = `<div onclick="event.stopPropagation(); window.deletePost('${postId}'); this.parentElement.remove();" style="position:absolute; top:15px; right:15px; color:#ef4444; font-size:1.2rem; cursor:pointer;" title="Elimina post"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg></div>`;

            postDiv.innerHTML = `
                ${deleteBtn}
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
                    <div style="font-size:2rem; background:var(--bg-card); width:45px; height:45px; display:flex; justify-content:center; align-items:center; border-radius:50%; box-shadow:0 2px 10px rgba(0,0,0,0.1);">${post.authorAvatar || '👤'}</div>
                    <div>
                        <div style="font-weight:bold; color:var(--text-main); font-size:1rem;">${post.authorName}</div>
                        <div style="font-size:0.75rem; color:var(--text-sub);">${post.createdAt ? new Date(post.createdAt.toDate()).toLocaleDateString('it-IT', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : 'Ora'}</div>
                    </div>
                </div>
                
                ${post.imageUrl ? `<div style="margin-bottom:15px; border-radius:12px; overflow:hidden; border:1px solid var(--border); background:var(--bg-card);"><img src="${post.imageUrl}" onclick="openImageView('${post.imageUrl}', event)" style="width:100%; max-height:400px; object-fit:cover; display:block; cursor:pointer; transition:0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'"></div>` : ''}
                
                <div onclick="openPostDetail('${postId}')" style="color:var(--text-main); font-size:1.05rem; line-height:1.5; margin-bottom:20px; white-space:pre-wrap; cursor:pointer;">${post.content}</div>
                
                <div style="display:flex; gap:15px; border-top:1px solid var(--border); padding-top:15px;">
                    <button onclick="toggleLike('${postId}', ${isLiked})" style="background:${isLiked ? '#FEE2E2' : 'var(--bg-card)'}; color:${isLiked ? '#ef4444' : 'var(--text-sub)'}; border:1px solid ${isLiked ? '#ef4444' : 'var(--border)'}; padding:8px 15px; border-radius:50px; cursor:pointer; font-weight:bold; transition:0.2s; display:flex; align-items:center; gap:5px;">
                        ${isLiked ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="#ef4444" stroke-width="2" fill="#ef4444"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>' : '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>'} ${likesCount}
                    </button>
                    <button onclick="openPostDetail('${postId}')" style="background:var(--bg-card); color:var(--text-sub); border:1px solid var(--border); padding:8px 15px; border-radius:50px; cursor:pointer; font-weight:bold; transition:0.2s; display:flex; align-items:center; gap:5px;">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> ${post.commentCount || 0}
                    </button>
                </div>
            `;
            postsGrid.appendChild(postDiv);
        });
    }).catch(err => {
        console.error(err);
        postsGrid.innerHTML = '<div style="text-align:center; color:#ef4444; padding:20px;">Errore caricamento.</div>';
    });
};

// --- GESTIONE ANTEPRIMA IMMAGINE POST ---

window.previewSelectedImage = (input) => {
    const container = document.getElementById('image-preview-container');
    const img = document.getElementById('image-preview-img');
    
    // Se l'utente ha selezionato un file
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            img.src = e.target.result; // Mette la foto nel tag <img>
            container.classList.remove('hidden'); // Rende visibile il box
        }
        reader.readAsDataURL(input.files[0]); // Legge il file
    }
};

window.removeImagePreview = () => {
    document.getElementById('post-image-input').value = ""; // Svuota la memoria del file
    document.getElementById('image-preview-img').src = "";  // Togli l'immagine
    document.getElementById('image-preview-container').classList.add('hidden'); // Nasconde il box
};

// --- GESTIONE TABS MAZZI ---
window.currentDecksTab = 'mine';

window.switchDecksTab = (tab) => {
    window.currentDecksTab = tab;
    
    // Accende/spegne l'estetica dei bottoni
    document.getElementById('tab-decks-mine').classList.toggle('active', tab === 'mine');
    document.getElementById('tab-decks-shared').classList.toggle('active', tab === 'shared');
    
    // Mostra/nasconde i contenitori
    document.getElementById('panel-decks-mine').classList.toggle('hidden', tab !== 'mine');
    document.getElementById('panel-decks-shared').classList.toggle('hidden', tab !== 'shared');
    
    if (tab === 'shared') {
        window.loadSharedDecks();
    }
};

window.loadSharedDecks = () => {
    
    window.renderCustomDecks(); 
};

// --- GESTIONE CONDIVISIONE MAZZI ---
window.sharePermission = 'read'; // Permesso predefinito

window.openShareDeckModal = () => {
    const select = document.getElementById('share-friend-select');
    select.innerHTML = '<option value="">Caricamento amici...</option>';
    document.getElementById('modal-share-deck').classList.remove('hidden');
    
    // Se non hai amici, te lo dice
    if (!userData.friends || userData.friends.length === 0) {
        select.innerHTML = '<option value="">Non hai ancora aggiunto amici!</option>';
        return;
    }
    
    // Popola la tendina scaricando i nomi da Firebase
    select.innerHTML = '<option value="">Seleziona un amico...</option>';
    userData.friends.forEach(async (fid) => {
        try {
            const snap = await getDoc(doc(db, "users", fid));
            if (snap.exists()) {
                const f = snap.data();
                const opt = document.createElement('option');
                opt.value = fid;
                opt.innerText = f.username;
                select.appendChild(opt);
            }
        } catch(e) { console.error(e); }
    });
    
    window.selectSharePermission('read'); // Resetta lo stile dei bottoni
};

window.selectSharePermission = (perm) => {
    window.sharePermission = perm;
    const btnRead = document.getElementById('btn-perm-read');
    const btnEdit = document.getElementById('btn-perm-edit');
    
    // Colora il bottone cliccato di Verde/Primario e spegne l'altro
    if (perm === 'read') {
        btnRead.style.background = 'var(--primary)';
        btnRead.style.color = 'white';
        btnRead.style.border = '2px solid var(--primary)';
        
        btnEdit.style.background = 'var(--bg-body)';
        btnEdit.style.color = 'var(--text-main)';
        btnEdit.style.border = '2px solid var(--border)';
    } else {
        btnEdit.style.background = 'var(--primary)';
        btnEdit.style.color = 'white';
        btnEdit.style.border = '2px solid var(--primary)';
        
        btnRead.style.background = 'var(--bg-body)';
        btnRead.style.color = 'var(--text-main)';
        btnRead.style.border = '2px solid var(--border)';
    }
};

window.sendDeckToFriend = async () => {
    const friendId = document.getElementById('share-friend-select').value;
    if (!friendId) return window.showToast("Seleziona un amico a cui inviare il mazzo!", true);
    
    // Prende i dati del mazzo che stai guardando
    const deck = customDecks[currentActiveDeckIndex];
    
    try {
        // Manda il pacco al database (Prepariamo il terreno per la Fase 2!)
        await addDoc(collection(db, "notifications"), {
            to: friendId,
            from: currentUser.uid,
            fromName: userData.username,
            type: "deck_share",
            deckName: deck.name,
            deckData: deck.cards,
            permission: window.sharePermission,
            createdAt: serverTimestamp(),
            status: "unread"
        });
        
        document.getElementById('modal-share-deck').classList.add('hidden');
        window.showToast("Mazzo inviato con successo!");
    } catch (e) {
        console.error("Errore invio mazzo:", e);
        window.showToast("Errore durante l'invio.", true);
    }
};

// --- CENTRO NOTIFICHE GLOBALE ---

window.currentNotificationsData = {};
let unsubscribeNotifications = null;
let _notifFirstLoad = true;

function _dismissBanner(banner) {
    if (!banner?.parentNode) return;
    banner.style.transform = 'translateX(-50%) translateY(-130px)';
    setTimeout(() => banner?.remove(), 380);
}

function _showInAppBanner(n) {
    document.getElementById('inapp-notif-banner')?.remove();

    const typeMap = {
        chat_msg:       { icon: '💬', label: 'NUOVO MESSAGGIO',    action: () => { openChat(n.from, n.fromName, n.fromAvatar || '👤'); } },
        friend_request: { icon: '👤', label: 'RICHIESTA AMICIZIA', action: () => openNotifications() },
        deck_share:     { icon: '📦', label: 'MAZZO RICEVUTO',      action: () => openNotifications() },
        challenge:      { icon: '⚔️', label: 'SFIDA!',              action: () => openNotifications() },
        post_like:      { icon: '❤️', label: 'NUOVO MI PIACE',      action: () => openNotifications() },
        comment:        { icon: '💬', label: 'NUOVA RISPOSTA',      action: () => openNotifications() },
    };
    const t = typeMap[n.type];
    if (!t) return;

    const text = n.type === 'chat_msg'   ? `${n.fromName}: "${n.textSnippet}"` :
                 n.type === 'deck_share' ? `${n.fromName} ti ha inviato "${n.deckName}"` :
                 n.fromName || '';

    const banner = document.createElement('div');
    banner.id = 'inapp-notif-banner';
    banner.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%) translateY(-130px);width:min(90%,380px);background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:13px 15px;box-shadow:0 8px 28px rgba(0,0,0,0.18);z-index:99999;display:flex;align-items:center;gap:12px;cursor:pointer;transition:transform 0.35s cubic-bezier(0.34,1.56,0.64,1);touch-action:pan-y;user-select:none;';

    banner.innerHTML = `
        <div style="font-size:1.7rem;flex-shrink:0;">${t.icon}</div>
        <div style="flex:1;min-width:0;overflow:hidden;">
            <div style="font-size:0.68rem;color:var(--primary);font-weight:800;letter-spacing:0.06em;margin-bottom:2px;">${t.label}</div>
            <div style="font-size:0.88rem;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${text}</div>
        </div>
        <div style="color:var(--text-sub);font-size:1.1rem;flex-shrink:0;">➔</div>
    `;

    document.body.appendChild(banner);
    requestAnimationFrame(() => requestAnimationFrame(() => {
        banner.style.transform = 'translateX(-50%) translateY(0)';
    }));

    let timer = setTimeout(() => _dismissBanner(banner), 4500);

    banner.onclick = () => { clearTimeout(timer); _dismissBanner(banner); t.action(); };

    let sx = 0;
    banner.addEventListener('touchstart', e => {
        sx = e.touches[0].clientX;
        banner.style.transition = 'none';
        clearTimeout(timer);
    }, { passive: true });
    banner.addEventListener('touchmove', e => {
        const dx = e.touches[0].clientX - sx;
        banner.style.transform = `translateX(calc(-50% + ${dx}px)) translateY(0)`;
    }, { passive: true });
    banner.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - sx;
        banner.style.transition = 'transform 0.3s ease';
        if (Math.abs(dx) > 70) {
            banner.style.transform = `translateX(calc(-50% + ${dx > 0 ? 120 : -120}%)) translateY(0)`;
            setTimeout(() => banner.remove(), 300);
        } else {
            banner.style.transform = 'translateX(-50%) translateY(0)';
            timer = setTimeout(() => _dismissBanner(banner), 3000);
        }
    }, { passive: true });
}

window.listenForGlobalNotifications = () => {
    if(unsubscribeNotifications) unsubscribeNotifications();
    
    const q = query(collection(db, "notifications"), where("to", "==", currentUser.uid));
    
    unsubscribeNotifications = onSnapshot(q, (snap) => {
        const list = document.getElementById('notifications-list');
        const badge = document.getElementById('notif-badge'); 
        
        window.currentNotificationsData = {};
        let unreadCount = 0;
        let notifsArray = [];

        if (snap.empty) {
            list.innerHTML = '<div style="text-align:center; color:var(--text-sub); padding:30px;">Tutto tranquillo. Nessuna nuova notifica!</div>';
            if(badge) badge.classList.add('hidden');
            return;
        }

        snap.forEach(docSnap => {
            let n = docSnap.data();
            n.id = docSnap.id;
            notifsArray.push(n);
            if (n.status === 'unread') unreadCount++;
        });

        notifsArray.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

        if (badge) {
            if (unreadCount > 0) {
                badge.innerText = unreadCount;
                badge.classList.remove('hidden');
                badge.style.background = '#ef4444';
                badge.style.color = 'white';
                badge.style.borderRadius = '50%';
                badge.style.padding = '2px 6px';
                badge.style.fontSize = '0.8rem';
            } else {
                badge.classList.add('hidden');
            }
        }

        let html = '';
        notifsArray.forEach(n => {
            const nId = n.id;
            window.currentNotificationsData[nId] = n;
            const bgStyle = n.status === 'unread' ? 'background:var(--bg-body); border-left:4px solid var(--primary);' : 'background:transparent; border:1px solid var(--border); opacity:0.8;';
            
            // MAGIC: Variabili per lo swipe e il tasto X
            const swipeEvents = `ontouchstart="window.notifTouchStart(event, this)" ontouchmove="window.notifTouchMove(event, this)" ontouchend="window.notifTouchEnd(event, this, '${nId}')"`;
            const btnX = `<button onclick="window.deleteNotification('${nId}')" style="position:absolute; top:12px; right:12px; width:26px; height:26px; border-radius:50%; background:var(--bg-card); border:1px solid var(--border); color:var(--text-sub); display:flex; justify-content:center; align-items:center; cursor:pointer; font-weight:bold; z-index:10; font-size: 0.8rem; transition:0.2s;" onmouseover="this.style.background='#ef4444'; this.style.color='white'">✕</button>`;

            if (n.type === 'deck_share') {
                const permText = n.permission === 'edit' ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Modificabile' : '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> Solo Lettura';
                html += `
                <div style="${bgStyle} padding:15px; border-radius:12px; margin-bottom: 10px; position:relative;">
                    <div style="font-size:0.8rem; color:var(--primary); font-weight:bold; margin-bottom:5px;"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg> MAZZO RICEVUTO</div>
                    <div style="color:var(--text-main); font-size:0.95rem; margin-bottom:10px;">
                        <b>${n.fromName}</b> ti ha inviato "<b>${n.deckName}</b>".<br>
                        <span style="font-size:0.8rem; color:var(--text-sub);">${permText} • ${n.deckData ? n.deckData.length : 0} carte</span>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button onclick="acceptSharedDeck('${nId}')" style="flex:1; background:#10b981; color:white; border:none; padding:8px; border-radius:8px; font-weight:bold; cursor:pointer;">Accetta</button>
                        <button onclick="deleteNotification('${nId}')" style="flex:1; background:transparent; color:#ef4444; border:1px solid #ef4444; padding:8px; border-radius:8px; font-weight:bold; cursor:pointer;">Rifiuta</button>
                    </div>
                </div>`;
            } else if (n.type === 'friend_request') {
                html += `
                <div style="${bgStyle} padding:15px; border-radius:12px; margin-bottom: 10px; position:relative;">
                    <div style="font-size:0.8rem; color:#f59e0b; font-weight:bold; margin-bottom:5px;"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg> RICHIESTA AMICIZIA</div>
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                        <div style="font-size:1.5rem; background:var(--bg-card); width:35px; height:35px; display:flex; justify-content:center; align-items:center; border-radius:50%;">${n.fromAvatar || '👤'}</div>
                        <div style="color:var(--text-main); font-size:0.95rem;"><b>${n.fromName}</b> vuole essere tuo amico.</div>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button onclick="acceptFriendRequestNotif('${nId}', '${n.from}')" style="flex:1; background:#10b981; color:white; border:none; padding:8px; border-radius:8px; font-weight:bold; cursor:pointer;">Accetta</button>
                        <button onclick="deleteNotification('${nId}')" style="flex:1; background:transparent; color:#ef4444; border:1px solid #ef4444; padding:8px; border-radius:8px; font-weight:bold; cursor:pointer;">Rifiuta</button>
                    </div>
                </div>`;
            } else if (n.type === 'post_like') {
                html += `
                <div ${swipeEvents} style="${bgStyle} padding:15px; border-radius:12px; margin-bottom: 10px; position:relative; overflow:hidden;">
                    ${btnX}
                    <div style="font-size:0.8rem; color:#ec4899; font-weight:bold; margin-bottom:5px;"><svg viewBox="0 0 24 24" width="16" height="16" stroke="#ef4444" stroke-width="2" fill="#ef4444"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg> NUOVO MI PIACE</div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="font-size:1.5rem; background:var(--bg-card); width:35px; height:35px; display:flex; justify-content:center; align-items:center; border-radius:50%;">${n.fromAvatar || '👤'}</div>
                        <div style="color:var(--text-main); font-size:0.95rem; flex:1; padding-right:30px;">A <b>${n.fromName}</b> piace qualcosa che hai scritto.</div>
                    </div>
                    <button onclick="openPostDetail('${n.postId}'); closeNotifications();" style="margin-top:10px; width:100%; background:var(--bg-card); border:1px solid var(--border); color:var(--text-main); padding:8px; border-radius:8px; font-weight:bold; cursor:pointer;">Apri Post ➔</button>
                </div>`;
            } else if (n.type === 'comment') {
                html += `
                <div ${swipeEvents} style="${bgStyle} padding:15px; border-radius:12px; margin-bottom: 10px; position:relative; overflow:hidden;">
                    ${btnX}
                    <div style="font-size:0.8rem; color:#3b82f6; font-weight:bold; margin-bottom:5px;"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> NUOVA RISPOSTA</div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="font-size:1.5rem; background:var(--bg-card); width:35px; height:35px; display:flex; justify-content:center; align-items:center; border-radius:50%;">${n.fromAvatar || '👤'}</div>
                        <div style="color:var(--text-main); font-size:0.95rem; flex:1; padding-right:30px;"><b>${n.fromName}</b> ha risposto: <br><span style="color:var(--text-sub); font-style:italic;">"${n.textSnippet}..."</span></div>
                    </div>
                    <button onclick="openPostDetail('${n.postId}'); closeNotifications();" style="margin-top:10px; width:100%; background:var(--bg-card); border:1px solid var(--border); color:var(--text-main); padding:8px; border-radius:8px; font-weight:bold; cursor:pointer;">Leggi tutto ➔</button>
                </div>`;
            
            } else if (n.type === 'chat_msg') {
                html += `
                <div ${swipeEvents} style="${bgStyle} padding:15px; border-radius:12px; margin-bottom: 10px; position:relative; overflow:hidden;">
                    ${btnX}
                    <div style="font-size:0.8rem; color:#8b5cf6; font-weight:bold; margin-bottom:5px;"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> NUOVO MESSAGGIO</div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="font-size:1.5rem; background:var(--bg-card); width:35px; height:35px; display:flex; justify-content:center; align-items:center; border-radius:50%;">${n.fromAvatar || '👤'}</div>
                        <div style="color:var(--text-main); font-size:0.95rem; flex:1; padding-right:30px;"><b>${n.fromName}</b>: <br><span style="color:var(--text-sub); font-style:italic;">"${n.textSnippet}"</span></div>
                    </div>
                    <button onclick="openChat('${n.from}', '${n.fromName.replace(/'/g, "\\'")}', '${n.fromAvatar}'); closeNotifications(); window.deleteNotification('${nId}');" style="margin-top:10px; width:100%; background:var(--bg-card); border:1px solid var(--border); color:var(--text-main); padding:8px; border-radius:8px; font-weight:bold; cursor:pointer;">Rispondi ➔</button>
                </div>`;    
            }
            
        });
        list.innerHTML = html;

        // Mostra banner floating per le notifiche nuove (non al primo caricamento)
        snap.docChanges().forEach(change => {
            if (change.type === 'added' && !_notifFirstLoad) {
                const n = { ...change.doc.data(), id: change.doc.id };
                if (n.status === 'unread') _showInAppBanner(n);
            }
        });
        _notifFirstLoad = false;
    });
};

window.openNotifications = () => {
    document.getElementById('dropdown-menu').classList.remove('show');
    document.getElementById('modal-notifications').classList.remove('hidden');

    // Segna tutte le notifiche come lette non appena apri il menu!
    for (const nId in window.currentNotificationsData) {
        if (window.currentNotificationsData[nId].status === 'unread') {
            updateDoc(doc(db, "notifications", nId), { status: "read" }).catch(e=>console.error(e));
        }
    }
};

window.closeNotifications = () => {
    document.getElementById('modal-notifications').classList.add('hidden');
};

// Accetta l'amicizia direttamente dal nuovo Centro Notifiche
window.acceptFriendRequestNotif = async (nId, senderId) => {
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { friends: arrayUnion(senderId) });
        await updateDoc(doc(db, "users", senderId), { friends: arrayUnion(currentUser.uid) });
        await deleteDoc(doc(db, "notifications", nId));
        if (!userData.friends.includes(senderId)) userData.friends.push(senderId);
        window.showToast("Amicizia accettata!");
        if(typeof renderFriends === "function") renderFriends();
    } catch(e) { window.showToast("Errore di connessione.", true); }
};

window.acceptSharedDeck = async (nId) => {
    const notif = window.currentNotificationsData[nId];
    if(!notif) return;

    // Inietta il mazzo nei nostri Custom Decks
    customDecks.push({
        name: notif.deckName,
        cards: notif.deckData || [],
        shared: true,
        permission: notif.permission,
        ownerName: notif.fromName
    });
    window.saveCustomDecks();
    
    // --- AGGIUNGI QUESTA RIGA ---
    window.renderCustomDecks(); 

    // Cancella la notifica
    await deleteDoc(doc(db, "notifications", nId));
    window.showToast("Mazzo salvato! Lo trovi in 'Condivisi con me'");
};

window.deleteNotification = async (nId) => {
    try {
        await deleteDoc(doc(db, "notifications", nId));
        window.showToast("Notifica rifiutata/eliminata."); 
    } catch (e) {
        console.error("Errore durante l'eliminazione della notifica:", e);
        window.showToast("Errore di connessione.", true);
    }
};

// --- MOTORE SWIPE NOTIFICHE (MOBILE) ---

window.notifStartX = 0;

window.notifTouchStart = (e, el) => {
    // Salva il punto esatto in cui l'utente ha poggiato il dito
    window.notifStartX = e.touches[0].clientX;
    el.style.transition = 'none'; // Spegne l'animazione per seguire il dito fluidamente
};

window.notifTouchMove = (e, el) => {
    if (!window.notifStartX) return;
    let diff = e.touches[0].clientX - window.notifStartX;
    
    // Permette lo swipe SOLO verso destra
    if (diff > 0) {
        el.style.transform = `translateX(${diff}px)`;
        // Fa sbiadire la notifica man mano che la trascini
        el.style.opacity = 1 - (diff / 300);
    }
};

window.notifTouchEnd = (e, el, nId) => {
    if (!window.notifStartX) return;
    let diff = e.changedTouches[0].clientX - window.notifStartX;
    
    if (diff > 100) { 
        // Se hai trascinato per più di 100 pixel, la notifica viene eliminata!
        el.style.transition = '0.3s ease-out';
        el.style.transform = 'translateX(100%)';
        el.style.opacity = '0';
        
        // Aspetta che l'animazione finisca e cancella fisicamente dal database
        setTimeout(() => {
            window.deleteNotification(nId);
        }, 300);
    } else {
        // Se ci hai ripensato e non hai trascinato abbastanza, torna al suo posto
        el.style.transition = '0.3s ease-out';
        el.style.transform = 'translateX(0)';
        el.style.opacity = '1';
    }
    window.notifStartX = 0;
};

// ==========================================
// MOTORE CHAT PRIVATA
// ==========================================

let currentChatFriendId = null;
let currentChatId = null;
let unsubscribeChat = null;

// Questo trucco geniale assicura che TU e il TUO AMICO abbiate sempre lo stesso ID della stanza chat!
window.getChatId = (uid1, uid2) => {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
};

window.openChat = (friendId, friendName, friendAvatar) => {
    currentChatFriendId = friendId;
    currentChatId = window.getChatId(currentUser.uid, friendId);
    
    document.getElementById('chat-username').innerText = friendName;
    document.getElementById('chat-avatar').innerText = friendAvatar || '👤';
    document.getElementById('modal-chat').classList.remove('hidden');
    
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = '<div style="text-align:center; color:var(--text-sub); margin-top:20px;">Sincronizzazione in corso...</div>';
    
    if (unsubscribeChat) unsubscribeChat(); // Chiude vecchie chat
    
    // Ascolta la stanza in tempo reale!
    const q = query(collection(db, `chats/${currentChatId}/messages`), orderBy("createdAt", "asc"));
    
    unsubscribeChat = onSnapshot(q, (snapshot) => {
        messagesContainer.innerHTML = '';
        
        if (snapshot.empty) {
            messagesContainer.innerHTML = '<div style="text-align:center; color:var(--text-sub); margin-top:40px; font-size:1.1rem;">Nessun messaggio.<br>Inizia la conversazione!</div>';
            return;
        }
        
        snapshot.forEach(docSnap => {
            const msg = docSnap.data();
            const isMe = msg.senderId === currentUser.uid;
            
            const align = isMe ? 'flex-end' : 'flex-start';
            const bg = isMe ? 'var(--primary)' : 'var(--bg-body)';
            const color = isMe ? 'white' : 'var(--text-main)';
            const radius = isMe ? '15px 15px 0 15px' : '15px 15px 15px 0';
            const time = msg.createdAt ? new Date(msg.createdAt.toDate()).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}) : '';
            
            let mediaHtml = '';
            if (msg.imageUrl) {
                mediaHtml = `<img src="${msg.imageUrl}" onclick="openImageView('${msg.imageUrl}', event)" style="max-width:200px; max-height:200px; border-radius:10px; cursor:pointer; margin-bottom:${msg.text ? '8px' : '0'}; display:block; object-fit:cover;">`;
            }
            
            // MAGIC: Motore di riconoscimento della sfida e UX intelligente
            let displayMessage = msg.text || '';
            if (displayMessage.includes("[SFIDA_")) {
                const match = displayMessage.match(/\[SFIDA_(.*?)\]/);
                if (match) {
                    const challengeId = match[1];
                    if (isMe) {
                        // L'hai mandata tu: mostra stato di attesa
                        displayMessage = displayMessage.replace(/\[SFIDA_.*?\]/, `<br><span style="font-size:0.85rem; opacity:0.9; background:rgba(255,255,255,0.2); padding:5px 10px; border-radius:8px; display:inline-block; margin-top:5px;">In attesa di risposta...</span>`);
                    } else {
                        // L'ha mandata l'amico: mostra il bottone per accettare
                        displayMessage = displayMessage.replace(/\[SFIDA_.*?\]/, `<br><button onclick="window.acceptChallenge('${challengeId}')" style="background:#ef4444; color:white; border:none; padding:8px 15px; border-radius:8px; font-weight:bold; cursor:pointer; margin-top:8px; box-shadow:0 4px 10px rgba(239, 68, 68, 0.4); transition:0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">Accetta Sfida <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg></button>`);
                    }
                }
            }
            
            // ORA stampiamo displayMessage invece di msg.text!
            let textHtml = displayMessage ? `<div style="font-size:1rem; word-break:break-word;">${displayMessage}</div>` : '';

            messagesContainer.innerHTML += `
                <div style="display:flex; justify-content:${align}; margin-bottom:5px; width:100%;">
                    <div style="max-width:75%; background:${bg}; color:${color}; padding:12px 16px; border-radius:${radius}; border:${isMe ? 'none' : '1px solid var(--border)'}; line-height:1.4; position:relative; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                        ${mediaHtml}
                        ${textHtml}
                        <div style="font-size:0.7rem; opacity:0.7; text-align:right; margin-top:6px;">${time}</div>
                    </div>
                </div>
            `;
        });
        
        setTimeout(() => { messagesContainer.scrollTop = messagesContainer.scrollHeight; }, 100);
    });
};

window.closeChat = () => {
    document.getElementById('modal-chat').classList.add('hidden');
    currentChatFriendId = null;
    currentChatId = null;
    if (unsubscribeChat) {
        unsubscribeChat();
        unsubscribeChat = null;
    }
};

window.sendChatMessage = async () => {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !currentChatId) return;
    
    input.value = ''; // Pulisce il testo all'istante per farti scrivere ancora
    
    try {
        // Salva il messaggio nella stanza
        await addDoc(collection(db, `chats/${currentChatId}/messages`), {
            senderId: currentUser.uid,
            text: text,
            createdAt: serverTimestamp()
        });
        
        // Spara la notifica all'amico!
        await addDoc(collection(db, "notifications"), {
            type: "chat_msg",
            from: currentUser.uid,
            fromName: userData.username,
            fromAvatar: userData.avatar,
            to: currentChatFriendId,
            status: "unread",
            textSnippet: text.substring(0, 30) + (text.length > 30 ? '...' : ''),
            createdAt: serverTimestamp()
        });
    } catch (e) {
        console.error("Errore invio messaggio:", e);
        window.showToast("Errore di connessione", true);
    }
};

// --- MOTORE CHAT FLUTTUANTE (STILE LOL) ---

window.toggleMiniFriendsList = () => {
    const list = document.getElementById('mini-friends-list');
    list.classList.toggle('hidden');
    if (!list.classList.contains('hidden')) {
        window.renderMiniFriends();
    }
};

window.renderMiniFriends = () => {
    const container = document.getElementById('mini-friends-content');
    container.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-sub);">Caricamento...</div>';
    
    if (!userData.friends || userData.friends.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-sub);">Aggiungi degli amici per chattare!</div>';
        return;
    }
    
    container.innerHTML = '';
    userData.friends.forEach(async (fid) => {
        let fData = usersCache[fid];
        // Scarica i dati se non ci sono
        if (!fData) {
            try {
                const snap = await getDoc(doc(db, "users", fid));
                if (snap.exists()) { fData = snap.data(); usersCache[fid] = fData; }
            } catch(e){}
        }
        
        if (fData) {
            const div = document.createElement('div');
            div.style = "display:flex; align-items:center; gap:10px; padding:10px; cursor:pointer; border-radius:10px; transition:0.2s; border-bottom:1px solid var(--border);";
            div.onmouseover = () => div.style.background = 'var(--bg-body)';
            div.onmouseout = () => div.style.background = 'transparent';
            div.onclick = () => {
                window.toggleMiniFriendsList(); // Chiudi la tendina amici
                window.openChat(fid, fData.username.replace(/'/g, "\\'"), fData.avatar);
            };
            div.innerHTML = `
                <div style="font-size:1.5rem; background:var(--bg-body); width:35px; height:35px; display:flex; justify-content:center; align-items:center; border-radius:50%; box-shadow:0 2px 5px rgba(0,0,0,0.1);">${fData.avatar || '👤'}</div>
                <div style="font-weight:bold; color:var(--text-main); font-size:0.95rem;">${fData.username}</div>
            `;
            container.appendChild(div);
        }
    });
};

window.isChatFullscreen = false;
window.toggleChatSize = () => {
    const chat = document.getElementById('modal-chat');
    window.isChatFullscreen = !window.isChatFullscreen;
    
    if (window.isChatFullscreen) {
        // Modalità a tutto schermo!
        chat.style.width = '100%';
        chat.style.height = '100%';
        chat.style.bottom = '0';
        chat.style.right = '0';
        chat.style.borderRadius = '0';
        chat.style.zIndex = '9999'; // In primissimo piano
    } else {
        // Ritorna piccola in basso a destra
        chat.style.width = '350px';
        chat.style.height = '450px';
        chat.style.bottom = '20px';
        chat.style.right = '20px';
        chat.style.borderRadius = '15px';
        chat.style.zIndex = '9100';
    }
    
    // Mantiene lo scroll fisso in basso quando si allarga/rimpicciolisce
    setTimeout(() => {
        const msgs = document.getElementById('chat-messages');
        if(msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 300);
};

window.sendChatImage = async (input) => {
    if (!input.files || !input.files[0] || !currentChatId) return;
    const file = input.files[0];
    window.showToast("Invio immagine in corso...");

    try {
        // Carica la foto nello storage
        const storageRef = ref(storage, 'chat_images/' + Date.now() + "_" + file.name);
        await uploadBytes(storageRef, file);
        const imageUrl = await getDownloadURL(storageRef);

        // Salva il messaggio nella stanza chat
        await addDoc(collection(db, `chats/${currentChatId}/messages`), {
            senderId: currentUser.uid,
            text: "", // Nessun testo, solo foto
            imageUrl: imageUrl,
            createdAt: serverTimestamp()
        });
        
        // Spara la notifica all'amico!
        await addDoc(collection(db, "notifications"), {
            type: "chat_msg",
            from: currentUser.uid,
            fromName: userData.username,
            fromAvatar: userData.avatar,
            to: currentChatFriendId,
            status: "unread",
            textSnippet: "Ha inviato un'immagine", // Messaggio speciale per la notifica
            createdAt: serverTimestamp()
        });

        input.value = ""; // Resetta la memoria del file
    } catch (e) {
        console.error("Errore invio immagine:", e);
        window.showToast("Errore durante l'invio dell'immagine.", true);
    }
};

// ==========================================
// MOTORE GIOCO MULTIPLAYER (DUELLO KANJI)
// ==========================================

let currentDuelId = null;
let duelData = null;
let duelUnsubscribe = null;
let myDuelIdx = 0;
let myDuelCorrect = 0;
let duelTimerInt = null;
let duelTenths = 0; // Decimi di secondo per precisione
let amIChallenger = false;

window.sendChallenge = () => {
    if (!currentChatFriendId) return;
    // Invece di far partire subito la sfida, apriamo la modale per scegliere quante carte!
    document.getElementById('modal-random-challenge').classList.remove('hidden');
    document.getElementById('custom-challenge-count').value = ''; // Resetta l'input manuale
};

window.startCustomRandomChallenge = () => {
    const input = document.getElementById('custom-challenge-count');
    const val = parseInt(input.value);
    
    if (isNaN(val) || val <= 0) {
        return window.showToast("Inserisci un numero valido maggiore di zero!", true);
    }
    if (val > 50) {
        return window.showToast("Il limite massimo è di 50 Kanji per sfida!", true);
    }
    
    // Se è valido, fa partire la sfida con quel numero
    window.executeRandomChallenge(val);
};

window.executeRandomChallenge = async (count) => {
    document.getElementById('modal-random-challenge').classList.add('hidden');
    if (!currentChatFriendId) return;
    
    const friendName = document.getElementById('chat-username').innerText;

    // Pesca ESATTAMENTE il numero di Kanji richiesto ('count') dal DB globale
    let pool = [...window.kanjiData].sort(() => 0.5 - Math.random()).slice(0, count);
    
    try {
        const challengeRef = await addDoc(collection(db, "challenges"), {
            challengerId: currentUser.uid,
            challengerName: userData.username,
            opponentId: currentChatFriendId,
            opponentName: friendName,
            status: "pending",
            questions: pool,
            p1Progress: 0, p1Score: 0, p1Finished: false, p1Time: 999,
            p2Progress: 0, p2Score: 0, p2Finished: false, p2Time: 999,
            createdAt: serverTimestamp()
        });

        // Specifichiamo nel messaggio quante carte ci sono!
        const msgRef = await addDoc(collection(db, `chats/${currentChatId}/messages`), {
            senderId: currentUser.uid,
            text: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> Ti ho sfidato a colpi di Kanji (${count} carte)! Accetta qui: [SFIDA_${challengeRef.id}]`,
            challengeId: challengeRef.id,
            createdAt: serverTimestamp()
        });
        
        // Notifica per l'avversario
        await addDoc(collection(db, "notifications"), {
            type: "chat_msg",
            from: currentUser.uid,
            fromName: userData.username,
            fromAvatar: userData.avatar,
            to: currentChatFriendId,
            status: "unread",
            textSnippet: `Ti ha lanciato una sfida da ${count} carte!`,
            createdAt: serverTimestamp()
        });
        
        window.showToast("Sfida inviata! Attendi che accetti...");
        amIChallenger = true;
        window.listenToChallenge(challengeRef.id, msgRef.id);
        
    } catch(e) {
        console.error("Errore invio sfida:", e);
        window.showToast("Errore di rete.", true);
    }
};

window.acceptChallenge = async (challengeId) => {
    amIChallenger = false;
    await updateDoc(doc(db, "challenges", challengeId), { status: "accepted" });
    window.listenToChallenge(challengeId, null);
};

// L'Arbitro di Firebase: ascolta in tempo reale cosa succede nella stanza
window.listenToChallenge = (challengeId, msgIdToUpdate) => {
    currentDuelId = challengeId;
    if(duelUnsubscribe) duelUnsubscribe();
    
    document.getElementById('duel-overlay').classList.remove('hidden');
    document.getElementById('duel-overlay').classList.remove('active-duel'); // Resetta lo stato
    
    // Aggiungiamo il tasto ANNULLA se sei tu che aspetti
    let btnAnnulla = amIChallenger ? `<button onclick="window.annullaSfida('${challengeId}')" style="margin-top:20px; background:transparent; color:#ef4444; border:1px solid #ef4444; padding:10px 20px; border-radius:20px; cursor:pointer; font-weight:bold; transition:0.2s;" onmouseover="this.style.background='#FEE2E2'" onmouseout="this.style.background='transparent'">Annulla Sfida ✕</button>` : '';

    document.getElementById('duel-center-area').innerHTML = `
        <div style="margin-bottom:15px; display:flex; justify-content:center;"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14M5 2h14M5 2v5a7 7 0 0 0 14 0V2M5 22v-5a7 7 0 0 1 14 0v5"></path></svg></div>
        <h2 style="color:var(--text-main);">In attesa dell'avversario...</h2>
        ${btnAnnulla}
    `;
    
    document.getElementById('duel-input-area').classList.add('hidden');
    document.getElementById('duel-timer').innerText = "00.0";
    
    duelUnsubscribe = onSnapshot(doc(db, "challenges", challengeId), (docSnap) => {
        if(!docSnap.exists()) return;
        duelData = docSnap.data();
        
        // Se qualcuno annulla la sfida
        if (duelData.status === 'cancelled') {
            if(duelUnsubscribe) duelUnsubscribe();
            document.getElementById('duel-overlay').classList.add('hidden');
            window.showToast("Sfida annullata.");
            return;
        }

        // SISTEMA DI SICUREZZA
        if (!duelData.questions || duelData.questions.length === 0) {
            window.showToast("Errore di caricamento carte. Sfida annullata.", true);
            window.annullaSfida(challengeId);
            return;
        }
        
        let maxQ = duelData.questions.length; // Conta quante carte ci sono realmente

        // SE L'AMICO HA ACCETTATO -> PARTE IL COUNTDOWN PER ENTRAMBI!
        if (duelData.status === 'accepted' && !document.getElementById('duel-overlay').classList.contains('active-duel')) {
            document.getElementById('duel-overlay').classList.add('active-duel');
            startDuelCountdown();
        }
        
        // AGGIORNA I PALLINI E IL PUNTEGGIO DELL'AVVERSARIO IN TEMPO REALE
        if (duelData.status === 'accepted' || duelData.status === 'finished') {
            let oppProg = amIChallenger ? duelData.p2Progress : duelData.p1Progress;
            oppProg = oppProg || 0; 
            document.getElementById('duel-opp-score').innerText = `${oppProg}/${maxQ}`;
            renderDuelDots('duel-opp-dots', oppProg, maxQ);
        }
        
        // SE ENTRAMBI HANNO FINITO -> CALCOLA VINCITORE
        if (duelData.p1Finished && duelData.p2Finished && duelData.status !== 'completed') {
            window.finishDuelGlobal(msgIdToUpdate);
        }
    });
};

window.annullaSfida = async (challengeId) => {
    try {
        await updateDoc(doc(db, "challenges", challengeId), { status: "cancelled" });
    } catch(e) {
        document.getElementById('duel-overlay').classList.add('hidden');
    }
};

function startDuelCountdown() {
    const center = document.getElementById('duel-center-area');
    let count = 3;
    let maxQ = duelData.questions.length;
    
    // Resetta statistiche e input
    myDuelIdx = 0; myDuelCorrect = 0; duelTenths = 0;
    renderDuelDots('duel-my-dots', 0, maxQ);
    renderDuelDots('duel-opp-dots', 0, maxQ);
    document.getElementById('duel-my-score').innerText = `0/${maxQ}`;
    document.getElementById('duel-input').value = "";
    
    const interval = setInterval(() => {
        center.innerHTML = `<div style="font-size:8rem; font-weight:900; color:var(--primary); text-shadow:0 10px 30px rgba(99,102,241,0.5);">${count}</div>`;
        if(typeof window.playGameSound === 'function') window.playGameSound('ok');
        
        count--;
        if (count < 0) {
            clearInterval(interval);
            center.innerHTML = `<div style="font-size:6rem; font-weight:900; color:#10b981;">VIA!</div>`;
            setTimeout(() => {
                document.getElementById('duel-input-area').classList.remove('hidden');
                startDuelTimer();
                window.renderDuelQuestion(); // IL FIX ERA QUI!
            }, 800);
        }
    }, 1000);
}

function startDuelTimer() {
    if(duelTimerInt) clearInterval(duelTimerInt);
    const tEl = document.getElementById('duel-timer');
    duelTimerInt = setInterval(() => {
        duelTenths++;
        tEl.innerText = (duelTenths / 10).toFixed(1);
    }, 100);
}

function renderDuelDots(containerId, progress, max) {
    const c = document.getElementById(containerId);
    c.innerHTML = '';
    for(let i=0; i<max; i++) {
        let color = i < progress ? '#10b981' : 'var(--border)';
        c.innerHTML += `<div style="width:12px; height:12px; border-radius:50%; background:${color}; box-shadow:0 2px 5px rgba(0,0,0,0.1);"></div>`;
    }
}

window.renderDuelQuestion = () => {
    const center = document.getElementById('duel-center-area');
    let q = duelData.questions[myDuelIdx];
    let maxQ = duelData.questions.length;
    
    // Cambiamo il suggerimento in base al tipo di carta per non confondere l'utente
    let hintText = "";
    const responseIsJapanese = /[\u3040-\u30ff]/.test(q.r);
    if (responseIsJapanese) {
        hintText = "Scrivi la lettura (si trasforma in automatico).";
    } else {
        hintText = "Scrivi in romaji o usa la tua tastiera giapponese.";
    }

    center.innerHTML = `
        <div style="font-size:1.2rem; color:var(--text-sub); font-weight:bold; margin-bottom:10px;">Domanda ${myDuelIdx + 1} di ${maxQ}</div>
        <div style="font-size:6rem; font-weight:900; color:var(--text-main); margin-bottom:20px; font-family:var(--font-jp);">${q.k}</div>
        <div style="font-size:1rem; color:var(--text-sub);">${hintText}</div>
    `;
    
    const input = document.getElementById('duel-input');
    input.disabled = false;
    input.value = '';
    setTimeout(() => input.focus(), 50);
};

// Conversione IME giapponese per il duello (FIXATA E INTELLIGENTE)
document.getElementById('duel-input').oninput = function() {
    if (!duelData || !duelData.questions || !duelData.questions[myDuelIdx]) return;
    const q = duelData.questions[myDuelIdx];
    
    // Attiva la conversione automatica SOLO se la risposta attesa è in hiragana (es: kanji o verbi)
    const responseIsJapanese = /[\u3040-\u30ff]/.test(q.r);
    
    if (responseIsJapanese) {
        const isKata = /[\u30a0-\u30ff]/.test(q.k);
        const val = this.value.toLowerCase();
        this.value = isKata ? toKatakana(val) : toHiragana(val);
    }
};

window.checkDuelAnswer = async () => {
    const inputEl = document.getElementById('duel-input');
    const val = inputEl.value.trim().toLowerCase();
    if(!val) return;
    
    let q = duelData.questions[myDuelIdx];
    let maxQ = duelData.questions.length;
    inputEl.disabled = true;
    
    // Controllo standard (legge il romaji o la traduzione italiana)
    let isCorrect = (val === q.r || val === q.s.toLowerCase());
    
    // MAGIC FIX PER LA TASTIERA GIAPPONESE:
    // Se la carta è solo Kana (non un kanji) e l'utente digita esattamente quel Kana con la sua tastiera
    const isOnlyKana = /^[\u3040-\u30ff]+$/.test(q.k);
    if (isOnlyKana && val === q.k) {
        isCorrect = true;
    }
    
    if (isCorrect) {
        myDuelCorrect++;
        inputEl.style.borderColor = "#10b981";
        inputEl.style.background = "#D1FAE5";
        if(typeof window.playGameSound === 'function') window.playGameSound('ok');
    } else {
        inputEl.style.borderColor = "#ef4444";
        inputEl.style.background = "#FEE2E2";
        if(typeof window.playGameSound === 'function') window.playGameSound('no');
    }
    
    myDuelIdx++;
    document.getElementById('duel-my-score').innerText = `${myDuelIdx}/${maxQ}`;
    renderDuelDots('duel-my-dots', myDuelIdx, maxQ);
    
    // Invia i progressi
    const fieldProg = amIChallenger ? "p1Progress" : "p2Progress";
    const fieldScore = amIChallenger ? "p1Score" : "p2Score";
    await updateDoc(doc(db, "challenges", currentDuelId), {
        [fieldProg]: myDuelIdx,
        [fieldScore]: myDuelCorrect
    });
    
    setTimeout(() => {
        inputEl.style.borderColor = "var(--border)";
        inputEl.style.background = "var(--bg-body)";
        if (myDuelIdx >= maxQ) {
            window.finishMyDuel();
        } else {
            window.renderDuelQuestion();
        }
    }, 400);
};

window.finishMyDuel = async () => {
    clearInterval(duelTimerInt);
    document.getElementById('duel-input-area').classList.add('hidden');
    document.getElementById('duel-center-area').innerHTML = `
        <div style="margin-bottom:20px; display:flex; justify-content:center;"><svg viewBox="0 0 24 24" width="56" height="56" stroke="#6366f1" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4a1 1 0 0 1 1.45-.89l13.1 6.55a1 1 0 0 1 0 1.79L5.45 17.99A1 1 0 0 1 4 17.1"></path></svg></div>
        <h2 style="color:var(--text-main); margin-bottom:10px;">Hai finito!</h2>
        <div style="font-size:1.5rem; color:var(--primary); font-weight:bold; margin-bottom:20px;">Tempo: ${(duelTenths / 10).toFixed(1)}s</div>
        <div style="color:var(--text-sub);">In attesa che l'avversario completi...</div>
    `;
    
    const fieldFin = amIChallenger ? "p1Finished" : "p2Finished";
    const fieldTime = amIChallenger ? "p1Time" : "p2Time";
    
    await updateDoc(doc(db, "challenges", currentDuelId), {
        [fieldFin]: true,
        [fieldTime]: (duelTenths / 10)
    });
};

window.finishDuelGlobal = async (msgIdToUpdate) => {
    if(duelUnsubscribe) { duelUnsubscribe(); duelUnsubscribe = null; }
    
    let p1Wins = false; let p2Wins = false; let pareggio = false;
    let maxQ = duelData.questions.length;
    
    if (duelData.p1Score > duelData.p2Score) p1Wins = true;
    else if (duelData.p2Score > duelData.p1Score) p2Wins = true;
    else {
        if (duelData.p1Time < duelData.p2Time) p1Wins = true;
        else if (duelData.p2Time < duelData.p1Time) p2Wins = true;
        else pareggio = true;
    }
    
    let resultTitle = pareggio ? "Pareggio!" : ( (amIChallenger && p1Wins) || (!amIChallenger && p2Wins) ? "Hai Vinto! " + "<svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" stroke=\"#f59e0b\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z\"></path><path d=\"M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4\"></path></svg>" : "Hai Perso!" );
    let resultColor = pareggio ? "#f59e0b" : ( (amIChallenger && p1Wins) || (!amIChallenger && p2Wins) ? "#10b981" : "#ef4444" );
    
    let myName = "Tu";
    let oppName = amIChallenger ? (duelData.opponentName || "Avversario") : (duelData.challengerName || "Avversario");
    
    let myScoreFinal = amIChallenger ? duelData.p1Score : duelData.p2Score;
    let oppScoreFinal = amIChallenger ? duelData.p2Score : duelData.p1Score;
    let myTimeFinal = amIChallenger ? duelData.p1Time : duelData.p2Time;
    let oppTimeFinal = amIChallenger ? duelData.p2Time : duelData.p1Time;

    const center = document.getElementById('duel-center-area');
    center.innerHTML = `
        <h1 style="font-size:3rem; color:${resultColor}; margin-bottom:30px; text-transform:uppercase;">${resultTitle}</h1>
        
        <div style="display:flex; width:100%; max-width:500px; gap:20px; margin-bottom:40px;">
            <div style="flex:1; background:var(--bg-card); border:2px solid ${resultColor}; border-radius:15px; padding:20px; box-shadow:0 10px 20px rgba(0,0,0,0.1);">
                <div style="font-weight:bold; color:var(--text-sub); margin-bottom:10px; text-transform:uppercase;">${myName}</div>
                <div style="font-size:2rem; font-weight:900; color:var(--text-main);">${myScoreFinal}/${maxQ}</div>
                <div style="font-size:1.2rem; color:var(--primary);">${myTimeFinal.toFixed(1)}s</div>
            </div>
            
            <div style="flex:1; background:var(--bg-card); border:2px solid var(--border); border-radius:15px; padding:20px; box-shadow:0 10px 20px rgba(0,0,0,0.1);">
                <div style="font-weight:bold; color:var(--text-sub); margin-bottom:10px; text-transform:uppercase;">${oppName}</div>
                <div style="font-size:2rem; font-weight:900; color:var(--text-main);">${oppScoreFinal}/${maxQ}</div>
                <div style="font-size:1.2rem; color:var(--primary);">${oppTimeFinal.toFixed(1)}s</div>
            </div>
        </div>
        
        <button onclick="document.getElementById('duel-overlay').classList.add('hidden'); document.getElementById('duel-overlay').classList.remove('active-duel');" style="background:var(--bg-body); border:2px solid var(--border); color:var(--text-main); padding:15px 40px; border-radius:25px; font-weight:bold; font-size:1.2rem; cursor:pointer;">Torna alla Chat ➔</button>
    `;
    
    if (amIChallenger && msgIdToUpdate) {
        await updateDoc(doc(db, "challenges", currentDuelId), { status: "completed" });
        let winnerName = pareggio ? "Nessuno (Pareggio)" : (p1Wins ? duelData.challengerName : duelData.opponentName);
        await updateDoc(doc(db, `chats/${currentChatId}/messages`, msgIdToUpdate), {
            text: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4a1 1 0 0 1 1.45-.89l13.1 6.55a1 1 0 0 1 0 1.79L5.45 17.99A1 1 0 0 1 4 17.1"></path></svg> Sfida Terminata! Vincitore: **${winnerName}** <svg viewBox="0 0 24 24" width="16" height="16" stroke="#f59e0b" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"></path><path d="M7 5H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M17 5h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4"></path></svg>`
        });
    }
};

// ==========================================
// LOGICA SFIDE PERSONALIZZATE DAI MAZZI
// ==========================================

window.openChallengeFriendModal = async () => {
    if (!chosen || chosen.length === 0) {
        return window.showToast("Devi prima selezionare almeno una carta per la sfida!", true);
    }

    const modal = document.getElementById('modal-select-friend-challenge');
    const list = document.getElementById('challenge-friends-list');
    list.innerHTML = '<div style="text-align:center; color:var(--text-sub); padding:10px;">Caricamento amici...</div>';
    modal.classList.remove('hidden');

    if (!userData.friends || userData.friends.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:var(--text-sub); font-weight:bold;">Non hai ancora aggiunto amici alla tua cerchia!</p>';
        return;
    }

    list.innerHTML = '';
    for (const fid of userData.friends) {
        let fData = usersCache[fid];
        if (!fData) {
            try {
                const snap = await getDoc(doc(db, "users", fid));
                if (snap.exists()) { fData = snap.data(); usersCache[fid] = fData; }
            } catch(e){}
        }
        if (fData) {
            const btn = document.createElement('button');
            btn.style = "display:flex; align-items:center; gap:15px; padding:12px; border-radius:12px; background:var(--bg-body); border:1px solid var(--border); cursor:pointer; transition:0.2s; width:100%; text-align:left;";
            btn.onmouseover = () => btn.style.borderColor = '#ef4444';
            btn.onmouseout = () => btn.style.borderColor = 'var(--border)';
            
            btn.onclick = () => window.sendCustomChallenge(fid, fData.username);
            
            btn.innerHTML = `
                <div style="font-size:1.5rem; background:var(--bg-card); width:45px; height:45px; border-radius:50%; display:flex; justify-content:center; align-items:center; box-shadow:0 2px 5px rgba(0,0,0,0.1);">${fData.avatar || '👤'}</div> 
                <div style="font-weight:bold; color:var(--text-main); font-size:1.1rem;">${fData.username}</div>
            `;
            list.appendChild(btn);
        }
    }
};

window.sendCustomChallenge = async (opponentId, opponentName) => {
    document.getElementById('modal-select-friend-challenge').classList.add('hidden');

    // MESCOLA LE CARTE DEL MAZZO SELEZIONATO (Prende tutte quelle scelte, massimo 50)
    let limit = Math.min(chosen.length, 50);
    let pool = [...chosen].sort(() => 0.5 - Math.random()).slice(0, limit);
    const chatId = window.getChatId(currentUser.uid, opponentId);

    try {
        const challengeRef = await addDoc(collection(db, "challenges"), {
            challengerId: currentUser.uid,
            challengerName: userData.username,
            opponentId: opponentId,
            opponentName: opponentName,
            status: "pending",
            questions: pool, 
            p1Progress: 0, p1Score: 0, p1Finished: false, p1Time: 999,
            p2Progress: 0, p2Score: 0, p2Finished: false, p2Time: 999,
            createdAt: serverTimestamp()
        });

        // Specifichiamo nel messaggio il numero esatto di carte!
        const msgRef = await addDoc(collection(db, `chats/${chatId}/messages`), {
            senderId: currentUser.uid,
            text: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> Ti ho sfidato su un mazzo specifico (${pool.length} carte)! Accetta qui: [SFIDA_${challengeRef.id}]`,
            challengeId: challengeRef.id,
            createdAt: serverTimestamp()
        });

        await addDoc(collection(db, "notifications"), {
            type: "chat_msg",
            from: currentUser.uid,
            fromName: userData.username,
            fromAvatar: userData.avatar,
            to: opponentId,
            status: "unread",
            textSnippet: `Ti ha lanciato una sfida da ${pool.length} carte!`,
            createdAt: serverTimestamp()
        });

        window.showToast("Sfida inviata!");

        const miniList = document.getElementById('mini-friends-list');
        if (miniList && !miniList.classList.contains('hidden')) window.toggleMiniFriendsList();

        window.openChat(opponentId, opponentName, usersCache[opponentId]?.avatar || '👤');

        amIChallenger = true;
        window.listenToChallenge(challengeRef.id, msgRef.id);

    } catch (e) {
        console.error("Errore Sfida Custom:", e);
        window.showToast("Errore di rete nell'invio della sfida.", true);
    }
};

// =====================================================
// PAROLA DEL GIORNO + DATA IN GIAPPONESE
// =====================================================

function _buildJpDateHTML() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    var dow = d.getDay();
    var dowK = ['日','月','火','水','木','金','土'][dow];
    return `<span style="font-size:1.4rem; font-weight:800; letter-spacing:0.02em;">${m}月${day}日</span><br><span style="font-size:1rem; font-weight:700; opacity:0.75;">${dowK}曜日</span>`;
}

window.renderDailyWord = function() {
    var wordEl = document.getElementById('daily-word-display');
    var dateEl = document.getElementById('jp-date-display');
    if (dateEl) dateEl.innerHTML = _buildJpDateHTML();
    if (!wordEl) return;
    var pool = window.kanjiData;
    if (!pool || pool.length === 0) return;
    var d = new Date();
    var seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    var entry = pool[seed % pool.length];
    wordEl.innerHTML = `<ruby style="font-size:2rem; font-weight:800; line-height:2.4;">${entry.k}<rt style="font-size:0.75rem; font-weight:400;">${entry.r}</rt></ruby><span style="font-size:0.92rem; color:var(--text-sub); display:block; margin-top:2px;">${entry.s}</span>`;
};

// Tutorial piattaforma: segna come visto in Firestore
window._markTutorialSeen = async function() {
    if (!currentUser) return;
    userData.tutorialSeen = true;
    await updateDoc(doc(db, 'users', currentUser.uid), { tutorialSeen: true }).catch(console.error);
};

// Tutorial per sezione: controlla e mostra se non ancora visto
window.checkSectionTutorial = function(key) {
    if (!userData.seenTutorials) userData.seenTutorials = {};
    if (!userData.seenTutorials[key]) {
        setTimeout(() => { if (typeof window.showSectionTutorial === 'function') window.showSectionTutorial(key); }, 800);
    }
};

window._markSectionTutorialSeen = async function(key) {
    if (!currentUser || !key) return;
    if (!userData.seenTutorials) userData.seenTutorials = {};
    userData.seenTutorials[key] = true;
    await updateDoc(doc(db, 'users', currentUser.uid), { seenTutorials: userData.seenTutorials }).catch(console.error);
};

window._resetSectionTutorial = async function(key) {
    if (!key) return;
    if (!userData.seenTutorials) userData.seenTutorials = {};
    delete userData.seenTutorials[key];
    if (!currentUser) return;
    await updateDoc(doc(db, 'users', currentUser.uid), { seenTutorials: userData.seenTutorials }).catch(console.error);
};

// =====================================================
// HOOK PRINCIPALE: aggiorna mostraRiassunto per XP + Achievement
// =====================================================

const _origMostraRiassunto = window.mostraRiassunto;
window.mostraRiassunto = async () => {
    window.speechSynthesis?.cancel();
    _origMostraRiassunto?.();
    _stopQuizTimer();

    if (!currentUser) return;

    // Traccia sessioni giornaliere
    const finalScore = (typeof score !== 'undefined') ? score : 0;
    const total = (typeof totalInitial !== 'undefined' && totalInitial > 0) ? totalInitial : 1;
    if (!userData.sessionHistory) userData.sessionHistory = [];
    const today = new Date().toISOString().slice(0,10);
    userData.sessionHistory.push({ date: today, score: finalScore, total });
    userData.sessionHistory = userData.sessionHistory.slice(-90);
    if (!userData.totalQuizzes) userData.totalQuizzes = 0;
    userData.totalQuizzes++;
    await updateDoc(doc(db, 'users', currentUser.uid), {
        sessionHistory: userData.sessionHistory,
        totalQuizzes: userData.totalQuizzes
    }).catch(console.error);
};

function _stopQuizTimer() {} // stub — modalità timer rimossa

// =====================================================
// NOTIFICHE PUSH
// =====================================================

window.toggleNotification = async (on) => {
    const slider  = document.getElementById('notif-slider');
    const knob    = document.getElementById('notif-knob');
    const timeRow = document.getElementById('notif-time-row');
    const status  = document.getElementById('notif-status');

    if (on) {
        if (!('Notification' in window)) {
            window.showToast?.('Le notifiche non sono supportate da questo browser.', true);
            document.getElementById('notif-toggle').checked = false;
            return;
        }
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
            window.showToast?.('Permesso notifiche negato. Abilita nelle impostazioni del browser.', true);
            document.getElementById('notif-toggle').checked = false;
            return;
        }
        if (slider) slider.style.background = '#6366f1';
        if (knob)   knob.style.transform   = 'translateX(20px)';
        if (timeRow) timeRow.style.display = 'flex';
        if (status) status.textContent = '✅ Promemoria attivo';
    } else {
        if (slider) slider.style.background = '#ccc';
        if (knob)   knob.style.transform   = 'translateX(0)';
        if (timeRow) timeRow.style.display = 'none';
        if (status) status.textContent = '';
    }
    await saveNotifSettings();
};

window.saveNotifSettings = async () => {
    if (!currentUser) return;
    const enabled = document.getElementById('notif-toggle')?.checked || false;
    const time    = document.getElementById('notif-time')?.value || '09:00';
    userData.notifications = { enabled, time };
    await updateDoc(doc(db, 'users', currentUser.uid), { notifications: { enabled, time } }).catch(console.error);
    _scheduleNotification(enabled, time);
};

function _scheduleNotification(enabled, time) {
    if (!enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const [hh, mm] = (time || '09:00').split(':').map(Number);
    const now  = new Date();
    const fire = new Date();
    fire.setHours(hh, mm, 0, 0);
    if (fire <= now) fire.setDate(fire.getDate() + 1); // domani
    const msUntil = fire - now;

    // Salva in localStorage per controllo all'apertura
    localStorage.setItem('jap_notif_time', time);
    localStorage.setItem('jap_notif_enabled', '1');

    if (msUntil < 24 * 60 * 60 * 1000) {
        setTimeout(() => {
            _sendNotification('JapStudy Pro 🎌', 'Hai studiato giapponese oggi? Apri l\'app e mantieni la serie! 🔥');
            // Rischedula domani
            _scheduleNotification(enabled, time);
        }, msUntil);
    }
}

function _sendNotification(title, body) {
    if (Notification.permission !== 'granted') return;
    if (window._swReg) {
        window._swReg.active?.postMessage({ type: 'SHOW_NOTIF', title, body });
    } else {
        new Notification(title, { body, icon: './icon-192.png', tag: 'japstudy-reminder' });
    }
}

// Controlla notifica schedulata all'apertura (per utenti che avevano già attivato)
function _checkScheduledNotifOnLoad() {
    const enabled = localStorage.getItem('jap_notif_enabled') === '1';
    const time    = localStorage.getItem('jap_notif_time') || '09:00';
    if (!enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    // Controlla se oggi la notifica non è stata ancora mandata
    const todayKey = 'jap_notif_sent_' + getTodayStr();
    if (!localStorage.getItem(todayKey)) {
        const [hh, mm] = time.split(':').map(Number);
        const now = new Date();
        if (now.getHours() > hh || (now.getHours() === hh && now.getMinutes() >= mm)) {
            _sendNotification('JapStudy Pro 🎌', 'Hai studiato giapponese oggi? Apri l\'app e mantieni la serie! 🔥');
            localStorage.setItem(todayKey, '1');
        }
    }
    _scheduleNotification(true, time);
}

// =====================================================
// CARICAMENTO UI NOTIFICHE (chiamata da updateStatsUI via window._loadNotifUI)
// =====================================================

window._loadNotifUI = function _loadNotifUI() {
    const notifData = userData.notifications || {};
    const toggle    = document.getElementById('notif-toggle');
    const timeInput = document.getElementById('notif-time');
    const slider    = document.getElementById('notif-slider');
    const knob      = document.getElementById('notif-knob');
    const timeRow   = document.getElementById('notif-time-row');
    const status    = document.getElementById('notif-status');

    if (toggle)    toggle.checked     = !!notifData.enabled;
    if (timeInput) timeInput.value    = notifData.time || '09:00';
    if (slider)    slider.style.background = notifData.enabled ? '#6366f1' : '#ccc';
    if (knob)      knob.style.transform   = notifData.enabled ? 'translateX(20px)' : 'translateX(0)';
    if (timeRow)   timeRow.style.display  = notifData.enabled ? 'flex' : 'none';
    if (status)    status.textContent     = notifData.enabled ? '✅ Promemoria attivo' : '';

    if (notifData.enabled) _checkScheduledNotifOnLoad();
}