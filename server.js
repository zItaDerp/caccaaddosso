const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// 1. IL CATALOGO DELLE CARTE
const catalogoCarte = [
    { id: "jack_fanf", nome: "JackFanf ¡67!", descrizione: "JackFanf ti ha colpito a suon di 67! Fai pescare due carte a chi vuoi tu!", immagine: "/images/jack-fanf.png", quantita: 6, tipoBersaglio: 'scelta' },
    { id: "mike", nome: "Mike", descrizione: "Mike e' sotto i portici.Ferma quello dopo per un turno e fagli sganciare qualche spicciolo!", immagine: "/images/mike.png", quantita: 5, tipoBersaglio: 'prossimo' },
    { id: "cacca_addosso", nome: "Cacca Addosso (OPSS)", descrizione: "Niente di che, fatto solo cacca addosso", immagine: "/images/cacca-addosso.png", quantita: 24, tipoBersaglio: 'nessuno' },
    { id: "auguri_befluxz", nome: "Tanti auguri Befluxz", descrizione: "Facciamo tutti gli auguri a Befluxz. Si cambia giro!", immagine: "/images/auguri-befluxz.jpg", quantita: 5, tipoBersaglio: 'nessuno' },
    { id: "ruba_carta", nome: "I piedi della regina", descrizione: "Che piedi stupendi! Ruba una carta a chi vuoi tu!", immagine: "/images/piedi-regina.png", quantita: 4, tipoBersaglio: 'scelta' },
    { id: "tutti_pescano", nome: "Pavesino alla crema", descrizione: "Tu sei il mio pavesino UwU. Tutti gli altri pescano 1 carta!", immagine: "/images/pavesino-crema.png", quantita: 4, tipoBersaglio: 'nessuno' },
    { id: "sbircia", nome: "The Rock", descrizione: "The Rock ti osserva! Sbircia le prime 3 carte del mazzo!", immagine: "/images/therock-meme.png", quantita: 4, tipoBersaglio: 'nessuno' },
    { id: "mescola_mazzo", nome: "Monika", descrizione: "Monika e' tornata! Mescola tutto il mazzo!", immagine: "/images/monika.png", quantita: 4, tipoBersaglio: 'nessuno' },
    { id: "braccio", nome: "Braccio alzato!", descrizione: "Tu tu tu tu! Tutte le mani vengono rimescolate!", immagine: "/images/braccio.png", quantita: 3, tipoBersaglio: 'nessuno' },
    { id: "scudo", nome: "Il FioreScudo", descrizione: "Il fiore preferito di Fonti, ti protegge da tutto!", immagine: "/images/fiorescudo.png", quantita: 8, tipoBersaglio: 'nessuno' },
    { id: "ninni", nome: "Ninni", descrizione: "Piano -1 da Ninni! Un giocatore a caso si becca una carta!", immagine: "/images/ninni.png", quantita: 4, tipoBersaglio: 'nessuno' },
    { id: "sessantasette", nome: "67", descrizione: "67! Scegli 2 giocatori: pescheranno fino ad avere uno 6 e l'altro 7 carte!", immagine: "/images/67.png", quantita: 3, tipoBersaglio: 'scelta_doppia' },
    { id: "roulette_russa", nome: "Roulette Russa", descrizione: "Carica la pistola! Scegli una vittima e una carta: pescherà finché non la trova!", immagine: "/images/rouletterussa.png", quantita: 2, tipoBersaglio: 'scelta_opzione' }
];

// 2. FUNZIONE PER CREARE E MESCOLARE IL MAZZO
function generaMazzo() {
    let mazzo = [];
    catalogoCarte.forEach(tipoCarta => {
        for(let i = 0; i < tipoCarta.quantita; i++) {
            mazzo.push({ ...tipoCarta, uid: Math.random().toString(36).substring(2, 9) }); 
        }
    });
    for (let i = mazzo.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mazzo[i], mazzo[j]] = [mazzo[j], mazzo[i]]; 
    }
    return mazzo;
}

// FUNZIONE PER PESCARE IN SICUREZZA GESTENDO IL RICICLO DEGLI SCARTI
function pescaCarta(partita, codiceLobby) {
    if (partita.mazzo.length === 0) {
        // Se ci sono carte negli scarti, le ricicliamo stile UNO
        if (partita.scarti.length > 0) {
            // Copiamo tutti gli scarti nel mazzo e svuotiamo la pila degli scarti
            partita.mazzo = [...partita.scarti];
            partita.scarti = [];
            
            // Mescoliamo il nuovo mazzo ottenuto dagli scarti (Fisher-Yates)
            for (let i = partita.mazzo.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [partita.mazzo[i], partita.mazzo[j]] = [partita.mazzo[j], partita.mazzo[i]];
            }
            
            // Inviamo un log e l'animazione di mazzo rimescolato a tutti
            if (codiceLobby) {
                io.to(codiceLobby).emit('nuovo_log', '🔄 Il mazzo era finito! Gli scarti sono stati rimescolati nel mazzo.');
                io.to(codiceLobby).emit('animazione_mescola_mazzo');
            }
        } else {
            // Caso estremo: non ci sono carte né nel mazzo né negli scarti (tutte in mano ai giocatori)
            return null;
        }
    }
    // Ritorna la prima carta del mazzo
    return partita.mazzo.shift();
}

app.use(express.static('public'));

const partite = {};

// --- FUNZIONI GLOBALI (Spostate fuori per evitare memory leak) ---
function avviaTimerTurno(codiceLobby) {
    let partita = partite[codiceLobby];
    if (!partita) return;
    
    if (partita.timeoutObj) clearTimeout(partita.timeoutObj);
    
    partita.timeoutObj = setTimeout(() => {
        if (partita.stato !== 'in_corso') return;
        
        let numGiocatori = partita.ordineGiocatori.length;
        if (numGiocatori === 0) return; 
        
        partita.indiceTurno = partita.indiceTurno % numGiocatori;
        let idAttuale = partita.ordineGiocatori[partita.indiceTurno];
        
        if (idAttuale && partita.giocatori[idAttuale]) {
            io.to(codiceLobby).emit('nuovo_log', `⏱️ Il tempo di ${partita.giocatori[idAttuale].nickname} è scaduto!`);
        }
        
        partita.indiceTurno = (partita.indiceTurno + partita.direzione + numGiocatori) % numGiocatori;
        let idProssimoTurno = partita.ordineGiocatori[partita.indiceTurno];
        
        if (idProssimoTurno && partita.giocatori[idProssimoTurno]) {
            let nicknameProssimo = partita.giocatori[idProssimoTurno].nickname;
            io.to(codiceLobby).emit('cambio_turno', { id: idProssimoTurno, nickname: nicknameProssimo });
            avviaTimerTurno(codiceLobby); 
        }
    }, 60000); 
}

function gestisciUscita(socket) {
    for (let codiceLobby in partite) {
        let partita = partite[codiceLobby];
    
        if (partita.giocatori[socket.id]) {
            let nicknameUscito = partita.giocatori[socket.id].nickname;
            let eraHost = (socket.id === partita.host || socket.id === partita.idHost);
        
            delete partita.giocatori[socket.id];
            partita.ordineGiocatori = partita.ordineGiocatori.filter(id => id !== socket.id);
        
            io.to(codiceLobby).emit('nuovo_log', `❌ ${nicknameUscito} ha abbandonato la lobby.`);
            let rimasti = partita.ordineGiocatori;

            if (partita.stato === 'in_corso') {
                if (rimasti.length === 1) {
                    let idVincitore = rimasti[0];
                    let nicknameVincitore = partita.giocatori[idVincitore].nickname;
                
                    partita.stato = 'finita';
                    if (partita.timeoutObj) clearTimeout(partita.timeoutObj);
                
                    io.to(codiceLobby).emit('nuovo_log', `🏆 Vittoria a tavolino! ${nicknameVincitore} vince perché tutti hanno abbandonato!`);
                    io.to(codiceLobby).emit('partita_finita', { vincitore: nicknameVincitore, motivo: 'abbandono', idHost: partita.host || partita.idHost });
                
                    setTimeout(() => { delete partite[codiceLobby]; }, 5000);
                } else {
                    io.to(codiceLobby).emit('aggiorna_avversari', partita.giocatori);
                    io.to(codiceLobby).emit('aggiorna_conteggio', rimasti.length);
                }
            } else {
                io.to(codiceLobby).emit('aggiorna_avversari', partita.giocatori);
                io.to(codiceLobby).emit('aggiorna_conteggio', rimasti.length);
            
                if (rimasti.length === 0) {
                    if (partita.timeoutObj) clearTimeout(partita.timeoutObj);
                    delete partite[codiceLobby];
                } else if (eraHost) {
                    let nuovoHost = rimasti[0];
                    partita.host = nuovoHost;
                    partita.idHost = nuovoHost;
                    io.to(nuovoHost).emit('diventa_host');
                    io.to(codiceLobby).emit('nuovo_log', `👑 Il nuovo Host è ${partita.giocatori[nuovoHost].nickname}!`);
                }
            }
            socket.leave(codiceLobby); 
            break; 
        }
    }
}

// --- CONNESSIONE SOCKET ---
io.on('connection', (socket) => {
    console.log('Un giocatore si è connesso! ID:', socket.id);

    socket.on('crea_lobby', (dati) => { 
        const codiceLobby = Math.random().toString(36).substring(2, 6).toUpperCase();
        socket.join(codiceLobby);
    
        partite[codiceLobby] = {
            stato: 'attesa', host: socket.id, mazzo: generaMazzo(), scarti: [], giocatori: {}, ordineGiocatori: [socket.id], indiceTurno: 0, direzione: 1                  
        };
    
        partite[codiceLobby].giocatori[socket.id] = { nickname: dati.nickname, avatar: dati.avatar, mano: [], scudo: false };
    
        socket.emit('lobby_creata', { codice: codiceLobby, isHost: true });
        io.to(codiceLobby).emit('aggiorna_avversari', partite[codiceLobby].giocatori);
        io.to(codiceLobby).emit('aggiorna_conteggio', Object.keys(partite[codiceLobby].giocatori).length);
    });

    socket.on('entra_lobby', (dati) => {
        let codiceLobby = dati.codice;
        let partita = partite[codiceLobby];

        if (partita) {
            socket.join(codiceLobby);
            partita.giocatori[socket.id] = { nickname: dati.nickname, avatar: dati.avatar, mano: [], scudo: false };
            partita.ordineGiocatori.push(socket.id);
            
            socket.emit('entrato_in_lobby', { codice: codiceLobby, isHost: false });
            io.to(codiceLobby).emit('aggiorna_avversari', partita.giocatori);
            io.to(codiceLobby).emit('aggiorna_conteggio', Object.keys(partita.giocatori).length);
        } else {
            socket.emit('errore', 'Lobby non trovata!');
        }
    });

    socket.on('avvia_partita', () => {
        let codiceLobby = Object.keys(partite).find(c => partite[c].giocatori[socket.id]);
        if (codiceLobby) {
            let partita = partite[codiceLobby];
            
            if (partita.host === socket.id && (partita.stato === 'attesa' || partita.stato === 'finita')) {
                partita.stato = 'in_corso';
                partita.mazzo = generaMazzo(); 
                partita.scarti = [];           
                partita.indiceTurno = 0;       
                partita.direzione = 1;         
                
                partita.ordineGiocatori.forEach(idGiocatore => {
                    let manoIniziale = partita.mazzo.splice(0, 5);
                    partita.giocatori[idGiocatore].mano = manoIniziale;
                    io.to(idGiocatore).emit('partita_iniziata', manoIniziale);
                });

                io.to(codiceLobby).emit('aggiorna_avversari', partita.giocatori);
                let idPrimoTurno = partita.ordineGiocatori[partita.indiceTurno];
                io.to(codiceLobby).emit('cambio_turno', { id: idPrimoTurno, nickname: partita.giocatori[idPrimoTurno].nickname });
                
                avviaTimerTurno(codiceLobby); 
            }
        }
    });

    socket.on('gioca_carta', (datiPayload) => {
        const uidCarta = datiPayload.uid;
    
        // Corretto: prendiamo il primo elemento dell'array "bersagli" inviato dal client
        const idBersaglio = datiPayload.bersagli ? datiPayload.bersagli[0] : null;
        let codiceLobby = Object.keys(partite).find(c => partite[c].giocatori[socket.id]);

        if (!codiceLobby) return;
        let partita = partite[codiceLobby];
        if (partita.stato === 'finita') return;

        let idTurnoAttuale = partita.ordineGiocatori[partita.indiceTurno];
        if (socket.id !== idTurnoAttuale) {
            socket.emit('errore', "Fermo! Non è il tuo turno.");
            return; 
        }

        let mioGiocatore = partita.giocatori[socket.id];
        let indiceCarta = mioGiocatore.mano.findIndex(c => c.uid === uidCarta);
        
        if (indiceCarta !== -1) {
            let cartaDaGiocare = mioGiocatore.mano[indiceCarta];

            if ((cartaDaGiocare.id === 'jack_fanf' || cartaDaGiocare.id === 'ruba_carta') && idBersaglio) {
                if (partita.giocatori[idBersaglio] && partita.giocatori[idBersaglio].scudo) {
                    socket.emit('errore', `🛡️ Scudo Attivo! ${partita.giocatori[idBersaglio].nickname} è protetto. Scegli un altro bersaglio o un'altra carta.`);
                    return; 
                }
            }

            if (cartaDaGiocare.id === 'mike') {
                let numGiocatori = partita.ordineGiocatori.length;
                let indiceVittima = (partita.indiceTurno + partita.direzione + numGiocatori) % numGiocatori;
                let idVittima = partita.ordineGiocatori[indiceVittima];
                
                if (partita.giocatori[idVittima] && partita.giocatori[idVittima].scudo) {
                    socket.emit('errore', `🛡️ Il prossimo giocatore (${partita.giocatori[idVittima].nickname}) ha uno Scudo! Giocare questa carta sarebbe inutile, cambiala.`);
                    return; 
                }
            }

            if (partita.timeoutObj) clearTimeout(partita.timeoutObj);

            let cartaGiocata = mioGiocatore.mano.splice(indiceCarta, 1)[0];
            partita.scarti.push(cartaGiocata);
            io.to(codiceLobby).emit('nuovo_log', `${mioGiocatore.nickname} ha giocato [${cartaGiocata.nome}]`);

            let numGiocatori = partita.ordineGiocatori.length;
            let saltaProssimo = false; 

            switch(cartaGiocata.id) {
                case "jack_fanf": 
                    if (idBersaglio && partita.giocatori[idBersaglio]) {
                        if (partita.giocatori[idBersaglio].scudo) {
                            io.to(codiceLobby).emit('nuovo_log', `🛡️ ${partita.giocatori[idBersaglio].nickname} ha parato i colpi di JackFanf con lo Scudo!`);
                        } else {
                            let cartePescate = [];
                            for (let k = 0; k < 2; k++) {
                                let c = pescaCarta(partita, codiceLobby);
                                if (c) cartePescate.push(c);
                            }
                            if (cartePescate.length > 0) {
                                partita.giocatori[idBersaglio].mano.push(...cartePescate);
                                io.to(codiceLobby).emit('animazione_pesca', { idGiocatore: idBersaglio, quantita: cartePescate.length });
                                io.to(codiceLobby).emit('animazione_schermo', { testo: "+2 CARTE!", icona: "🃏", colore: "#ffaa00" });
                                setTimeout(() => {
                                    io.to(idBersaglio).emit('aggiorna_mano', partita.giocatori[idBersaglio].mano);
                                    io.to(codiceLobby).emit('aggiorna_avversari', partita.giocatori);
                                }, 800);
                            }
                        }
                    }
                    break;
                case "mike": 
                    let indiceVittima = (partita.indiceTurno + partita.direzione + numGiocatori) % numGiocatori;
                    let idVittima = partita.ordineGiocatori[indiceVittima];
                    let giocatoreVittima = partita.giocatori[idVittima];
                    if (giocatoreVittima.scudo) {
                        io.to(codiceLobby).emit('nuovo_log', `🛡️ ${giocatoreVittima.nickname} evita i portici illeso grazie allo Scudo!`);
                    } else {
                        saltaProssimo = true;
                        io.to(codiceLobby).emit('animazione_schermo', { testo: "SALTA IL TURNO!", icona: "🛑", colore: "#e94560" });
                    }
                    break;
                case "cacca_addosso":
                    io.to(codiceLobby).emit('animazione_schermo', { testo: "CACCA ADDOSSO! 💩", icona: "💩", colore: "#6f4e37" });
                    break;
                case "auguri_befluxz":
                    partita.direzione *= -1; 
                    io.to(codiceLobby).emit('animazione_schermo', { testo: "CAMBIO GIRO!", icona: "🔄", colore: "#00ccff" });
                    break;
                case "scudo":
                    mioGiocatore.scudo = true;
                    io.to(codiceLobby).emit('animazione_schermo', { testo: "SCUDO ATTIVO!", icona: "🛡️", colore: "#32CD32" });
                    break;
                case "ruba_carta":
                    if (idBersaglio && partita.giocatori[idBersaglio] && idBersaglio !== socket.id) {
                        let vittimaFurto = partita.giocatori[idBersaglio];
                        if (vittimaFurto.scudo) {
                            io.to(codiceLobby).emit('nuovo_log', `🛡️ Furto fallito! ${vittimaFurto.nickname} ha lo Scudo!`);
                        } else if (vittimaFurto.mano.length > 0) {
                            let indiceRandom = Math.floor(Math.random() * vittimaFurto.mano.length);
                            mioGiocatore.mano.push(vittimaFurto.mano.splice(indiceRandom, 1)[0]);
                            io.to(idBersaglio).emit('aggiorna_mano', vittimaFurto.mano);
                        }
                    }
                    break;
                case "tutti_pescano":
                    io.to(codiceLobby).emit('nuovo_log', `🃏 Un Pavesino alla crema per tutti! Tutti pescano 1 carta.`);

                    Object.keys(partita.giocatori).forEach(idGioc => { // <-- Corretto con =>
                        let c = pescaCarta(partita, codiceLobby); 
                        if (c) {
                            partita.giocatori[idGioc].mano.push(c);
                            io.to(idGioc).emit('aggiorna_mano', partita.giocatori[idGioc].mano);
                        }
                    });
                    io.to(codiceLobby).emit('aggiorna_avversari', partita.giocatori);
                    break;
                case "sbircia":
                    socket.emit('scegli_sbircia', partita.mazzo.slice(0, 3));
                    // FERMIAMO IL TURNO. Aspettiamo la risposta del client.
                    partita.sospesaPerSbircia = true;
                    return;
                case "mescola_mazzo":
                    if (partita.mazzo.length > 1) {
                        for (let i = partita.mazzo.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [partita.mazzo[i], partita.mazzo[j]] = [partita.mazzo[j], partita.mazzo[i]];
                        }
                    }
                    io.to(codiceLobby).emit('animazione_schermo', { testo: "MAZZO MESCOLATO!", icona: "🌪️", colore: "#FF1493" });
                    io.to(codiceLobby).emit('animazione_mescola_mazzo');
                    break;
                case "braccio":
                    io.to(codiceLobby).emit('animazione_schermo', { testo: "AIAIAI!", icona: "X", colore: "#ff0000" });
                    io.to(codiceLobby).emit('comunismo_scatenato');
                    let poolCarte = [], partecipanti = [];
                    partita.ordineGiocatori.forEach(id => {
                        if (partita.giocatori[id].scudo) {
                            io.to(codiceLobby).emit('nuovo_log', `🛡️ ${partita.giocatori[id].nickname} sfugge!`);
                        } else {
                            poolCarte.push(...partita.giocatori[id].mano);
                            partita.giocatori[id].mano = []; 
                            partecipanti.push(id);
                        }
                    });
                    if (poolCarte.length > 0 && partecipanti.length > 0) {
                        for (let i = poolCarte.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [poolCarte[i], poolCarte[j]] = [poolCarte[j], poolCarte[i]];
                        }
                        let indiceDistribuzione = 0;
                        while (poolCarte.length > 0) {
                            partita.giocatori[partecipanti[indiceDistribuzione % partecipanti.length]].mano.push(poolCarte.pop());
                            indiceDistribuzione++;
                        }
                        partecipanti.forEach(id => io.to(id).emit('aggiorna_mano', partita.giocatori[id].mano));
                    }
                    break;
                case "ninni":
                    let possibiliVittime = partita.ordineGiocatori.filter(id => id !== socket.id);
                    if (possibiliVittime.length > 0) {
                        let idSfortunato = possibiliVittime[Math.floor(Math.random() * possibiliVittime.length)];
                        let vittima = partita.giocatori[idSfortunato];
        
                        if (vittima.scudo) {
                            io.to(codiceLobby).emit('nuovo_log', `🛡️ La stecca rimbalza sullo scudo di ${vittima.nickname}!`);
                        } else {
                            io.to(codiceLobby).emit('animazione_ninni', idSfortunato); 
            
                            setTimeout(() => {
                                let c = pescaCarta(partita, codiceLobby);
                                if (c) {
                                    vittima.mano.push(c);
                                    // Aggiorna la schermata personale della vittima
                                    io.to(idSfortunato).emit('aggiorna_mano', vittima.mano);
                    
                                    // AGGIUNTA FONDAMENTALE: Aggiorna i contatori degli avversari per tutti
                                    io.to(codiceLobby).emit('aggiorna_avversari', partita.giocatori);
                    
                                    io.to(codiceLobby).emit('nuovo_log', `🎱 La palla ha colpito ${vittima.nickname}, che pesca 1 carta!`);
                                }
                            }, 3000); 
                        }
                    }
                    break;
                case "sessantasette":
                    if (datiPayload.bersagli && datiPayload.bersagli.length === 2) {
                        let target6 = Math.random() > 0.5 ? datiPayload.bersagli[0] : datiPayload.bersagli[1];
                        let target7 = target6 === datiPayload.bersagli[0] ? datiPayload.bersagli[1] : datiPayload.bersagli[0];

                        [ {id: target6, obj: 6}, {id: target7, obj: 7} ].forEach(t => {
                            let p = partita.giocatori[t.id];
                            if (p && !p.scudo) {
                                let pescateCount = 0;
                                // Sostituito il controllo mazzo con pescaCarta dentro al loop
                                while (p.mano.length < t.obj) {
                                    let c = pescaCarta(partita, codiceLobby);
                                    if (!c) break; // Ferma se non ci sono più carte in gioco
                                    p.mano.push(c);
                                    pescateCount++;
                                }
                                io.to(t.id).emit('aggiorna_mano', p.mano);
                                if(pescateCount > 0) io.to(codiceLobby).emit('animazione_pesca', { idGiocatore: t.id, quantita: pescateCount });
                                io.to(codiceLobby).emit('nuovo_log', `🃏 ${p.nickname} è stato forzato a ${t.obj} carte!`);
                            } else if (p && p.scudo) {
                                io.to(codiceLobby).emit('nuovo_log', `🛡️ Lo scudo di ${p.nickname} blocca il 67!`);
                            }
                        });
                    }
                    break;

                case "roulette_russa":
                    let vittimaId = datiPayload.bersagli[0];
                    let cartaObiettivo = datiPayload.opzioneExtra || "cacca_addosso";
                    let vittima = partita.giocatori[vittimaId];

                    if (vittima && !vittima.scudo) {
                        let trovata = false;
                        let contatore = 0;
                        const MAX_PESCATE = 7; // <- LIMITE DI SICUREZZA: Evita che un giocatore peschi 30 carte distruggendo il suo gioco

                        while (!trovata && contatore < MAX_PESCATE) {
                            let pescata = pescaCarta(partita, codiceLobby);
                            if (!pescata) {
                                io.to(codiceLobby).emit('nuovo_log', `⚠ Mazzo e scarti completamente esauriti! La Roulette si ferma.`);
                                break; // Ferma il ciclo se non ci sono proprio più carte in gioco
                            }
                            vittima.mano.push(pescata);
                            contatore++;
                            if (pescata.id === cartaObiettivo) trovata = true;
                        }
        
                        io.to(vittimaId).emit('aggiorna_mano', vittima.mano);
                        io.to(codiceLobby).emit('animazione_pesca', { idGiocatore: vittimaId, quantita: Math.min(contatore, 5) });
        
                        if (trovata) {
                            io.to(codiceLobby).emit('nuovo_log', `🔫 ROULETTE: ${vittima.nickname} ha pescato ${contatore} carte prima di trovare [${cartaObiettivo}]!`);
                        } else {
                            io.to(codiceLobby).emit('nuovo_log', `🔫 ROULETTE: ${vittima.nickname} ha pescato il limite di ${contatore} carte senza trovare l'obiettivo!`);
                        }
                    } else if (vittima && vittima.scudo) {
                        io.to(codiceLobby).emit('nuovo_log', `🛡️ Lo scudo salva ${vittima.nickname} dalla Roulette!`);
                    }
                    break;
            }

            // --- INIZIO NUOVO CONTROLLO VITTORIA ---
            let idVincitore = Object.keys(partita.giocatori).find(id => partita.giocatori[id].mano.length === 0);
            
            if (idVincitore) {
                let giocatoreVincente = partita.giocatori[idVincitore];
                partita.stato = 'finita'; 
                if (partita.timeoutObj) clearTimeout(partita.timeoutObj); 
                
                io.to(codiceLobby).emit('carta_scartata', cartaGiocata); 
                io.to(codiceLobby).emit('aggiorna_avversari', partita.giocatori); 
                
                // Aggiorniamo le mani di tutti per sicurezza
                Object.keys(partita.giocatori).forEach(id => {
                    io.to(id).emit('aggiorna_mano', partita.giocatori[id].mano);
                });
                
                io.to(codiceLobby).emit('nuovo_log', `🏆 ${giocatoreVincente.nickname} HA VINTO LA PARTITA!`);
                io.to(codiceLobby).emit('partita_finita', { vincitore: giocatoreVincente.nickname, idHost: partita.host });
                return; 
            }
            // --- FINE NUOVO CONTROLLO VITTORIA ---

            let passiTurno = saltaProssimo ? 2 : 1;
            partita.indiceTurno = (partita.indiceTurno + (partita.direzione * passiTurno) + numGiocatori) % numGiocatori;
            let idProssimoTurno = partita.ordineGiocatori[partita.indiceTurno];

            io.to(codiceLobby).emit('carta_scartata', cartaGiocata); 
            io.to(codiceLobby).emit('aggiorna_avversari', partita.giocatori); 
            socket.emit('aggiorna_mano', mioGiocatore.mano); 

            partita.giocatori[idProssimoTurno].scudo = false;
            io.to(codiceLobby).emit('cambio_turno', { id: idProssimoTurno, nickname: partita.giocatori[idProssimoTurno].nickname });
            
            avviaTimerTurno(codiceLobby); 
        }
    });

    socket.on('risolvi_sbircia', (indiceScelto) => {
        let codiceLobby = Object.keys(partite).find(c => partite[c].giocatori[socket.id]);
        if (!codiceLobby) return;
        let partita = partite[codiceLobby];
        let mioGiocatore = partita.giocatori[socket.id];

        if (indiceScelto !== -1 && partita.mazzo[indiceScelto]) {
            // Rimuove la carta dal mazzo e la mette in mano
            let cartaPresa = partita.mazzo.splice(indiceScelto, 1)[0];
            mioGiocatore.mano.push(cartaPresa);
            io.to(codiceLobby).emit('nuovo_log', `👁️ ${mioGiocatore.nickname} ha tenuto una carta scovata da The Rock!`);
        } else {
            io.to(codiceLobby).emit('nuovo_log', `👁️ ${mioGiocatore.nickname} non ha tenuto nessuna carta.`);
        }
        
        socket.emit('aggiorna_mano', mioGiocatore.mano);
        
        // Sblocca il gioco e passa il turno al prossimo giocatore
        partita.sospesaPerSbircia = false;
        let numGiocatori = partita.ordineGiocatori.length;
        partita.indiceTurno = (partita.indiceTurno + partita.direzione + numGiocatori) % numGiocatori;
        let idProssimoTurno = partita.ordineGiocatori[partita.indiceTurno];
        
        partita.giocatori[idProssimoTurno].scudo = false;
        io.to(codiceLobby).emit('cambio_turno', { id: idProssimoTurno, nickname: partita.giocatori[idProssimoTurno].nickname });
        avviaTimerTurno(codiceLobby);
    });

    socket.on('disconnect', () => gestisciUscita(socket));
    socket.on('abbandona_lobby', () => gestisciUscita(socket));
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Server attivo sulla porta ${PORT}`); });