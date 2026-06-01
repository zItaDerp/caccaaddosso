const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// 1. IL CATALOGO DELLE CARTE
const catalogoCarte = [
    { 
        id: "jack_fanf", 
        nome: "JackFanf ¡67!", 
        descrizione: "JackFanf ti ha colpito a suon di 67! Fai pescare due carte a chi vuoi tu!", 
        immagine: "/images/jack-fanf.png",
        quantita: 8,
        tipoBersaglio: 'scelta' // RICHIEDE IL CLICK SULL'AVVERSARIO
    },
    { 
        id: "mike_negro", 
        nome: "Mike Negro", 
        descrizione: "Mike negro e' sotto i portici.Ferma quello dopo per un turno e fagli sganciare qualche spicciolo!", 
        immagine: "/images/mike-negro.png",
        quantita: 6,
        tipoBersaglio: 'prossimo' // COLPISCE IN AUTOMATICO CHI VIENE DOPO
    },
    { 
        id: "cacca_addosso", 
        nome: "Cacca Addosso (OPSS)", 
        descrizione: "Niente di che, fatto solo cacca addosso", 
        immagine: "/images/cacca-addosso.png",
        quantita: 20,
        tipoBersaglio: 'nessuno' // SI GIOCA E BASTA
    },
    {
    id: "auguri_befluxz", 
        nome: "Tanti auguri Befluxz", 
        descrizione: "Facciamo tutti gli auguri a Befluxz. Si cambia giro!", 
        immagine: "/images/auguri-befluxz.jpg",
        quantita: 6,
        tipoBersaglio: 'nessuno' // Si gioca e basta, non serve cliccare su nessuno
    },
    { 
        id: "ruba_carta", 
        nome: "I piedi della regina", 
        descrizione: "Che piedi stupendi! Ruba una carta a chi vuoi tu!", 
        immagine: "/images/piedi-regina.png", // Metti le tue immagini qui
        quantita: 4,
        tipoBersaglio: 'scelta' 
    },
    { 
        id: "tutti_pescano", 
        nome: "Pavesino alla crema", 
        descrizione: "Tu sei il mio pavesino UwU. Tutti gli altri pescano 1 carta!", 
        immagine: "/images/pavesino-crema.png",
        quantita: 3,
        tipoBersaglio: 'nessuno' 
    },
    { 
        id: "sbircia", 
        nome: "The Rock", 
        descrizione: "The Rock ti osserva! Sbircia le prime 3 carte del mazzo!", 
        immagine: "/images/therock-meme.png",
        quantita: 4,
        tipoBersaglio: 'nessuno' 
    },
    { 
        id: "mescola_mazzo", 
        nome: "Monika", 
        descrizione: "Monika e' tornata! Mescola tutto il mazzo!", 
        immagine: "/images/monika.png",
        quantita: 3,
        tipoBersaglio: 'nessuno' 
    },
    { 
        id: "comunismo", 
        nome: "Braccio alzato!", 
        descrizione: "Viva il comunismo! Tutte le mani vengono rimescolate!", 
        immagine: "/images/comunismo.png",
        quantita: 2,
        tipoBersaglio: 'nessuno' 
    },
    { 
        id: "scudo", 
        nome: "Il FioreScudo", 
        descrizione: "Il fiore preferito di Fonti, ti protegge da tutto!", 
        immagine: "/images/fiorescudo.png",
        quantita: 5,
        tipoBersaglio: 'nessuno' 
    }
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

app.use(express.static('public'));

const partite = {};

io.on('connection', (socket) => {
    console.log('Un giocatore si è connesso! ID:', socket.id);

    // --- CREA LOBBY ---
    socket.on('crea_lobby', (dati) => { // <-- Cambiato 'nickname' con 'dati'
        const codiceLobby = Math.random().toString(36).substring(2, 6).toUpperCase();
        socket.join(codiceLobby);
    
        partite[codiceLobby] = {
            stato: 'attesa',              
            host: socket.id,              
            mazzo: generaMazzo(),
            scarti: [],
            giocatori: {},
            ordineGiocatori: [socket.id], 
            indiceTurno: 0,               
            direzione: 1                  
        };
    
        // <-- Aggiunto dati.avatar
        partite[codiceLobby].giocatori[socket.id] = { nickname: dati.nickname, avatar: dati.avatar, mano: [], scudo: false };
    
        socket.emit('lobby_creata', { codice: codiceLobby, isHost: true });
        io.to(codiceLobby).emit('aggiorna_avversari', partite[codiceLobby].giocatori);
        io.to(codiceLobby).emit('aggiorna_conteggio', Object.keys(partite[codiceLobby].giocatori).length);
    });

    // --- GIOCA CARTA E MOTORE EFFETTI ---
    socket.on('gioca_carta', (datiPayload) => {
        const uidCarta = datiPayload.uid;
        const idBersaglio = datiPayload.bersaglio;

        let codiceLobby = null;
        for (let codice in partite) {
            if (partite[codice].giocatori[socket.id]) {
                codiceLobby = codice;
                break;
            }
        }

        if (!codiceLobby) return;
        let partita = partite[codiceLobby];

        if (partita.stato === 'finita') return;

        // CONTROLLO TURNO (Spostato in alto prima di fermare il timer)
        let idTurnoAttuale = partita.ordineGiocatori[partita.indiceTurno];
        if (socket.id !== idTurnoAttuale) {
            socket.emit('errore', "Fermo! Non è il tuo turno.");
            return; 
        }

        let mioGiocatore = partita.giocatori[socket.id];
        let indiceCarta = mioGiocatore.mano.findIndex(c => c.uid === uidCarta);
        
        if (indiceCarta !== -1) {
            let cartaDaGiocare = mioGiocatore.mano[indiceCarta];

            // ---------------------------------------------------------
            // 🛡️ INIZIO CONTROLLO PREVENTIVO SCUDI
            // ---------------------------------------------------------
            // 1. Controllo per carte a "bersaglio diretto" (JackFanf, Ladro)
            if ((cartaDaGiocare.id === 'jack_fanf' || cartaDaGiocare.id === 'ruba_carta') && idBersaglio) {
                if (partita.giocatori[idBersaglio] && partita.giocatori[idBersaglio].scudo) {
                    // Inviamo l'errore al client e blocchiamo la mossa
                    socket.emit('errore', `🛡️ Scudo Attivo! ${partita.giocatori[idBersaglio].nickname} è protetto. Scegli un altro bersaglio o un'altra carta.`);
                    return; // Il return ferma il codice: la carta resta in mano!
                }
            }

            // 2. Controllo per carte automatiche "al prossimo" (Mike Negro)
            if (cartaDaGiocare.id === 'mike_negro') {
                let numGiocatori = partita.ordineGiocatori.length;
                let indiceVittima = (partita.indiceTurno + partita.direzione + numGiocatori) % numGiocatori;
                let idVittima = partita.ordineGiocatori[indiceVittima];
                
                if (partita.giocatori[idVittima] && partita.giocatori[idVittima].scudo) {
                    socket.emit('errore', `🛡️ Il prossimo giocatore (${partita.giocatori[idVittima].nickname}) ha uno Scudo! Giocare questa carta sarebbe inutile, cambiala.`);
                    return; 
                }
            }
            // ---------------------------------------------------------
            // 🛡️ FINE CONTROLLO PREVENTIVO
            // ---------------------------------------------------------

            // Se i controlli sono passati, la mossa è valida. 
            // ORA possiamo spegnere il timer del turno!
            if (partita.timeoutObj) clearTimeout(partita.timeoutObj);

            // Procediamo a rimuovere la carta dalla mano e ad applicare l'effetto
            let cartaGiocata = mioGiocatore.mano.splice(indiceCarta, 1)[0];
            partita.scarti.push(cartaGiocata);

            io.to(codiceLobby).emit('nuovo_log', `${mioGiocatore.nickname} ha giocato [${cartaGiocata.nome}]`);

            // ---------------------------------------------------------
            // MOTORE DEGLI EFFETTI (CORRETTO E AGGIORNATO)
            // ---------------------------------------------------------
            let numGiocatori = partita.ordineGiocatori.length;
            let saltaProssimo = false; 

            switch(cartaGiocata.id) {
                
                case "jack_fanf": 
                    if (idBersaglio && partita.giocatori[idBersaglio]) {
                        // FIX: Controllo scudo
                        if (partita.giocatori[idBersaglio].scudo) {
                            io.to(codiceLobby).emit('nuovo_log', `🛡️ ${partita.giocatori[idBersaglio].nickname} ha parato i colpi di JackFanf con lo Scudo!`);
                        } else {
                            let cartePescate = partita.mazzo.splice(0, 2);
                            partita.giocatori[idBersaglio].mano.push(...cartePescate);
                            
                            io.to(codiceLobby).emit('animazione_pesca', { idGiocatore: idBersaglio, quantita: 2 });
                            io.to(codiceLobby).emit('animazione_schermo', { testo: "+2 CARTE!", icona: "🃏", colore: "#ffaa00" });
                            io.to(codiceLobby).emit('nuovo_log', `🎯 ${mioGiocatore.nickname} fa pescare 2 carte a ${partita.giocatori[idBersaglio].nickname}!`);

                            setTimeout(() => {
                                io.to(idBersaglio).emit('aggiorna_mano', partita.giocatori[idBersaglio].mano);
                                io.to(codiceLobby).emit('aggiorna_avversari', partita.giocatori);
                            }, 800);
                        }
                    }
                    break;

                case "mike_negro": 
                    let indiceVittima = (partita.indiceTurno + partita.direzione + numGiocatori) % numGiocatori;
                    let idVittima = partita.ordineGiocatori[indiceVittima];
                    let giocatoreVittima = partita.giocatori[idVittima];
                    
                    // FIX: Controllo scudo per chi salta il turno
                    if (giocatoreVittima.scudo) {
                        io.to(codiceLobby).emit('nuovo_log', `🛡️ ${giocatoreVittima.nickname} evita i portici illeso grazie allo Scudo!`);
                    } else {
                        saltaProssimo = true;
                        io.to(codiceLobby).emit('animazione_schermo', { testo: "SALTA IL TURNO!", icona: "🛑", colore: "#e94560" });
                        io.to(codiceLobby).emit('nuovo_log', `🛑 ${giocatoreVittima.nickname} salta il turno!`);
                    }
                    break;

                case "cacca_addosso":
                    io.to(codiceLobby).emit('animazione_schermo', { testo: "CACCA ADDOSSO! 💩", icona: "💩", colore: "#6f4e37" });
                    io.to(codiceLobby).emit('nuovo_log', `💩 ${mioGiocatore.nickname} ha fatto la cacca addosso!`);
                    break;

                case "auguri_befluxz":
                    partita.direzione *= -1; 
                    io.to(codiceLobby).emit('animazione_schermo', { testo: "CAMBIO GIRO!", icona: "🔄", colore: "#00ccff" });
                    let testoDirezione = partita.direzione === 1 ? "ORARIO" : "ANTIORARIO";
                    io.to(codiceLobby).emit('nuovo_log', `🔄 Il senso del gioco è invertito in senso ${testoDirezione}.`);
                    break;
                
                case "scudo":
                    mioGiocatore.scudo = true;
                    io.to(codiceLobby).emit('animazione_schermo', { testo: "SCUDO ATTIVO!", icona: "🛡️", colore: "#32CD32" });
                    io.to(codiceLobby).emit('nuovo_log', `🛡️ ${mioGiocatore.nickname} è protetto fino al suo prossimo turno!`);
                    break;

                case "ruba_carta":
                    if (idBersaglio && partita.giocatori[idBersaglio] && idBersaglio !== socket.id) {
                        let vittimaFurto = partita.giocatori[idBersaglio];
                        if (vittimaFurto.scudo) {
                            io.to(codiceLobby).emit('nuovo_log', `🛡️ Furto fallito! ${vittimaFurto.nickname} ha lo Scudo!`);
                        } else if (vittimaFurto.mano.length > 0) {
                            let indiceRandom = Math.floor(Math.random() * vittimaFurto.mano.length);
                            let cartaRubata = vittimaFurto.mano.splice(indiceRandom, 1)[0];
                            mioGiocatore.mano.push(cartaRubata);
                            io.to(codiceLobby).emit('nuovo_log', `🥷 ${mioGiocatore.nickname} ha rubato una carta a ${vittimaFurto.nickname}!`);
                            io.to(idBersaglio).emit('aggiorna_mano', vittimaFurto.mano);
                        }
                    }
                    break;

                case "tutti_pescano":
                    io.to(codiceLobby).emit('animazione_schermo', { testo: "TUTTI PESCANO!", icona: "🌧️", colore: "#8A2BE2" });
                    io.to(codiceLobby).emit('nuovo_log', `🌧️ ${mioGiocatore.nickname} fa pescare una carta a tutti gli altri!`);
                    partita.ordineGiocatori.forEach(id => {
                        if (id !== socket.id && partita.mazzo.length > 0) {
                            if (partita.giocatori[id].scudo) {
                                io.to(codiceLobby).emit('nuovo_log', `🛡️ ${partita.giocatori[id].nickname} si ripara dalla pioggia con lo scudo!`);
                            } else {
                                partita.giocatori[id].mano.push(partita.mazzo.shift());
                                io.to(id).emit('aggiorna_mano', partita.giocatori[id].mano);
                            }
                        }
                    });
                    break;

                case "sbircia":
                    let prime3 = partita.mazzo.slice(0, 3);
                    socket.emit('risultato_sbircia', prime3);
                    io.to(codiceLobby).emit('nuovo_log', `👁️ ${mioGiocatore.nickname} sta sbirciando le prime 3 carte del mazzo!`);
                    break;

                case "mescola_mazzo":
                    if (partita.mazzo.length > 1) {
                        for (let i = partita.mazzo.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [partita.mazzo[i], partita.mazzo[j]] = [partita.mazzo[j], partita.mazzo[i]];
                        }
                    }
                    io.to(codiceLobby).emit('animazione_schermo', { testo: "MAZZO MESCOLATO!", icona: "🌪️", colore: "#FF1493" });
                    io.to(codiceLobby).emit('nuovo_log', `🌪️ Il mazzo centrale è stato mescolato e rimesso a posto!`);
                    
                    // NUOVA RIGA: Segnala al frontend di avviare l'animazione sul mazzo fisico
                    io.to(codiceLobby).emit('animazione_mescola_mazzo');
                    break;

                case "comunismo":
                    io.to(codiceLobby).emit('animazione_schermo', { testo: "COMUNISMO!", icona: "☭", colore: "#ff0000" });
                    io.to(codiceLobby).emit('nuovo_log', `☭ Le carte di tutti vengono ritirate e ridistribuite a caso!`);
                    
                    // FIX: Invia un segnale specifico ai client per attivare l'animazione globale
                    io.to(codiceLobby).emit('comunismo_scatenato');

                    let poolCarte = [];
                    let partecipanti = [];
                    
                    partita.ordineGiocatori.forEach(id => {
                        if (partita.giocatori[id].scudo) {
                            io.to(codiceLobby).emit('nuovo_log', `🛡️ ${partita.giocatori[id].nickname} sfugge al comunismo grazie allo Scudo!`);
                        } else {
                            poolCarte.push(...partita.giocatori[id].mano);
                            partita.giocatori[id].mano = []; // Svuota le mani
                            partecipanti.push(id);
                        }
                    });

                    // FIX: Distribuiamo solo se ci sono carte e giocatori validi
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

                        partecipanti.forEach(id => {
                            io.to(id).emit('aggiorna_mano', partita.giocatori[id].mano);
                        });
                    }
                    break;
            }
            // ---------------------------------------------------------

            // CONTROLLO VITTORIA
            if (mioGiocatore.mano.length === 0) {
                partita.stato = 'finita'; 
                
                // SPEGNIAMO IL TIMER (Nessuno deve più giocare)
                if (partita.timeoutObj) clearTimeout(partita.timeoutObj); 
                
                // AGGIORNAMENTI GRAFICI FINALI
                io.to(codiceLobby).emit('carta_scartata', cartaGiocata); 
                io.to(codiceLobby).emit('aggiorna_avversari', partita.giocatori); 
                socket.emit('aggiorna_mano', mioGiocatore.mano); 
                
                // ANNUNCIO VITTORIA (Fermiamo il codice col return)
                io.to(codiceLobby).emit('nuovo_log', `🏆 ${mioGiocatore.nickname} HA VINTO LA PARTITA!`);
                io.to(codiceLobby).emit('partita_finita', { vincitore: mioGiocatore.nickname, idHost: partita.host });
                return; 
            }

            // PASSAGGIO DEL TURNO
            // Avanziamo di 1 di base. Se saltaProssimo è true, avanziamo di 2!
            let passiTurno = saltaProssimo ? 2 : 1;
            
            // Calcolo in base alla direzione (per il futuro cambio giro)
            partita.indiceTurno = (partita.indiceTurno + (partita.direzione * passiTurno) + numGiocatori) % numGiocatori;
            
            let idProssimoTurno = partita.ordineGiocatori[partita.indiceTurno];

            // AGGIORNAMENTI GRAFICI GLOBALI
            io.to(codiceLobby).emit('carta_scartata', cartaGiocata); 
            io.to(codiceLobby).emit('aggiorna_avversari', partita.giocatori); 
            socket.emit('aggiorna_mano', mioGiocatore.mano); 

            // DISATTIVA LO SCUDO ALL'INIZIO DEL NUOVO TURNO
            partita.giocatori[idProssimoTurno].scudo = false;
            
            // FIX: Inviamo l'oggetto corretto e riavviamo il timer del server!
            io.to(codiceLobby).emit('cambio_turno', { 
                id: idProssimoTurno, 
                nickname: partita.giocatori[idProssimoTurno].nickname 
            });
            
            avviaTimerTurno(codiceLobby); // Fa ripartire il cronometro!
        }
    });

    // --- ENTRA IN LOBBY ---
    socket.on('entra_lobby', (dati) => {
        let codiceLobby = dati.codice;
        let partita = partite[codiceLobby];

        if (partita) {
            socket.join(codiceLobby);
        
            // <-- Aggiunto dati.avatar
            partita.giocatori[socket.id] = { nickname: dati.nickname, avatar: dati.avatar, mano: [], scudo: false };
            partita.ordineGiocatori.push(socket.id);
            
            socket.emit('entrato_in_lobby', { codice: codiceLobby, isHost: false });
            
            io.to(codiceLobby).emit('aggiorna_avversari', partita.giocatori);
            io.to(codiceLobby).emit('aggiorna_conteggio', Object.keys(partita.giocatori).length);
        } else {
            socket.emit('errore', 'Lobby non trovata!');
        }
    });

    // --- AVVIA PARTITA ---
    socket.on('avvia_partita', () => {
        let codiceLobby = null;
        for (let codice in partite) {
            if (partite[codice].giocatori[socket.id]) {
                codiceLobby = codice; break;
            }
        }

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
                
                // NUOVO INIZIO PARTITA
                let idPrimoTurno = partita.ordineGiocatori[partita.indiceTurno];
                io.to(codiceLobby).emit('cambio_turno', { 
                    id: idPrimoTurno, 
                    nickname: partita.giocatori[idPrimoTurno].nickname 
                });
                
                avviaTimerTurno(codiceLobby); // FACCIAMO PARTIRE IL CRONOMETRO!
            }
        }
    });

    // --- GESTIONE USCITA UNIFICATA FIXATA ---
    function gestisciUscita(socket) {
        for (let codiceLobby in partite) {
            let partita = partite[codiceLobby];
        
            if (partita.giocatori[socket.id]) {
                let nicknameUscito = partita.giocatori[socket.id].nickname;
            
                // Controlliamo se chi sta uscendo era l'host (gestiamo sia partita.host che partita.idHost per sicurezza)
                let eraHost = (socket.id === partita.host || socket.id === partita.idHost);
            
                // 1. Rimuovi il giocatore dalla partita
                delete partita.giocatori[socket.id];
                partita.ordineGiocatori = partita.ordineGiocatori.filter(id => id !== socket.id);
            
                io.to(codiceLobby).emit('nuovo_log', `❌ ${nicknameUscito} ha abbandonato la lobby.`);
            
                let rimasti = partita.ordineGiocatori;

                // 2. CONTROLLO IN BASE ALLO STATO DELLA PARTITA
                if (partita.stato === 'in_corso') {
                
                    // Se rimane un solo giocatore MENTRE LA PARTITA È IN CORSO, ha vinto a tavolino!
                    if (rimasti.length === 1) {
                        let idVincitore = rimasti[0];
                        let nicknameVincitore = partita.giocatori[idVincitore].nickname;
                    
                        partita.stato = 'finita';
                        if (partita.timeoutObj) clearTimeout(partita.timeoutObj);
                    
                        io.to(codiceLobby).emit('nuovo_log', `🏆 Vittoria a tavolino! ${nicknameVincitore} vince perché tutti hanno abbandonato!`);
                    
                        io.to(codiceLobby).emit('partita_finita', { 
                            vincitore: nicknameVincitore, 
                            motivo: 'abbandono',
                            idHost: partita.host || partita.idHost
                        });
                    
                        // Chiude la lobby dopo 5 secondi visto che è finita per abbandono totale
                        setTimeout(() => {
                            delete partite[codiceLobby];
                        }, 5000);
                    
                    } else {
                        // Se la partita continua con i restanti giocatori, aggiorna l'interfaccia
                        io.to(codiceLobby).emit('aggiorna_avversari', partita.giocatori);
                        io.to(codiceLobby).emit('aggiorna_conteggio', rimasti.length);
                    }
                
                } else if (partita.stato === 'finita') {
                    // FASE DI RIVINCITA: Qualcuno esce dopo che la partita si è già conclusa regolarmente
                    io.to(codiceLobby).emit('aggiorna_avversari', partita.giocatori);
                    io.to(codiceLobby).emit('aggiorna_conteggio', rimasti.length);
                
                    // Se se ne vanno tutti, distruggiamo la lobby
                    if (rimasti.length === 0) {
                        if (partita.timeoutObj) clearTimeout(partita.timeoutObj);
                        delete partite[codiceLobby];
                        console.log(`La Lobby ${codiceLobby} è stata chiusa perché vuota.`);
                    } else {
                        // Se l'host è uscito, passiamo la corona a chi è rimasto per permettergli di cliccare "Gioca Ancora"
                        if (eraHost) {
                            let nuovoHost = rimasti[0];
                            partita.host = nuovoHost;
                            partita.idHost = nuovoHost;
                            io.to(nuovoHost).emit('diventa_host'); // Avvisa il client che ora è il capo
                            io.to(codiceLobby).emit('nuovo_log', `👑 L'Host ha lasciato la lobby. Il nuovo Host è ${partita.giocatori[nuovoHost].nickname}!`);
                        }
                    }

                } else {
                    // STATO 'attesa' (Lobby iniziale prima di iniziare a giocare)
                    io.to(codiceLobby).emit('aggiorna_avversari', partita.giocatori);
                    io.to(codiceLobby).emit('aggiorna_conteggio', rimasti.length);
                
                    if (rimasti.length === 0) {
                        if (partita.timeoutObj) clearTimeout(partita.timeoutObj);
                        delete partite[codiceLobby];
                        console.log(`La Lobby ${codiceLobby} è stata chiusa perché vuota.`);
                    } else if (eraHost) {
                        // Cambio host anche nella lobby iniziale
                        let nuovoHost = rimasti[0];
                        partita.host = nuovoHost;
                        partita.idHost = nuovoHost;
                        io.to(nuovoHost).emit('diventa_host');
                    }
                }
            
                socket.leave(codiceLobby); 
                break; // Esci dal ciclo for
            }
        }
    }

    // FUNZIONE GIUDICE: GESTISCE LO SCADERE DEL TEMPO
    function avviaTimerTurno(codiceLobby) {
        let partita = partite[codiceLobby];
        if (!partita) return;
        
        // Pulisce l'eventuale timer precedente
        if (partita.timeoutObj) clearTimeout(partita.timeoutObj);
        
        // Imposta il timer di 60 secondi
        partita.timeoutObj = setTimeout(() => {
            // Se la partita è finita nel frattempo, non fare nulla
            if (partita.stato !== 'in_corso') return;
            
            let numGiocatori = partita.ordineGiocatori.length;
            if (numGiocatori === 0) return; // Se non c'è più nessuno, fermiamo tutto
            
            // FIX: Assicuriamoci che l'indice non sia andato fuori dai limiti (se qualcuno è uscito)
            partita.indiceTurno = partita.indiceTurno % numGiocatori;
            
            let idAttuale = partita.ordineGiocatori[partita.indiceTurno];
            
            // FIX CRITICO: Controlliamo se il giocatore esiste ancora prima di inviare il log
            if (idAttuale && partita.giocatori[idAttuale]) {
                io.to(codiceLobby).emit('nuovo_log', `⏱️ Il tempo di ${partita.giocatori[idAttuale].nickname} è scaduto!`);
            }
            
            // Passaggio forzato del turno
            partita.indiceTurno = (partita.indiceTurno + partita.direzione + numGiocatori) % numGiocatori;
            let idProssimoTurno = partita.ordineGiocatori[partita.indiceTurno];
            
            // Controlliamo che il prossimo giocatore sia valido
            if (idProssimoTurno && partita.giocatori[idProssimoTurno]) {
                let nicknameProssimo = partita.giocatori[idProssimoTurno].nickname;
                
                // Avvisiamo tutti e facciamo ripartire il timer per il prossimo
                io.to(codiceLobby).emit('cambio_turno', { id: idProssimoTurno, nickname: nicknameProssimo });
                avviaTimerTurno(codiceLobby); // Loop!
            }
            
        }, 60000); // 60.000 millisecondi = 60 secondi
    }

    // Ora entrambi gli eventi usano la stessa identica funzione infallibile!
    socket.on('disconnect', () => {
        gestisciUscita(socket);
    });

    socket.on('abbandona_lobby', () => {
        gestisciUscita(socket);
    });
});

// Sostituisci il tuo vecchio http.listen(3000, ...) con questo:
const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
    console.log(`Server attivo sulla porta ${PORT}`);
});