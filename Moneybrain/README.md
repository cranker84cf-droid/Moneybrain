# Moneybrain

Mobiler Web-App-Prototyp für Einnahmen, Ausgaben, Archiv und Belegimport.

## Lokal starten

Im Ordner `Moneybrain` einen statischen Webserver starten, zum Beispiel:

```powershell
python -m http.server 8080
```

Danach `http://localhost:8080` öffnen. Die Daten werden lokal im Browser gespeichert.

CSV-Dateien werden in der Reihenfolge `Datum;Empfänger/Beschreibung;Betrag` importiert. PDF- und Bilddateien landen zur manuellen Prüfung im Importdialog; für echte OCR ist im nächsten Schritt ein Backend oder ein externer Erkennungsdienst nötig.
