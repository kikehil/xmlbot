from flask import Flask, request, jsonify
import requests
import json
# Importamos las funciones de nuestro scraper
from scraper import extraer_reporte_generico, extraer_reporte_eolico

def es_fecha_mayor_a_uno(fecha_str):
    try:
        # Ejemplo: "6/1/2026 12:00:01 AM"
        # Nos quedamos solo con la fecha "6/1/2026"
        fecha_solo = fecha_str.split(' ')[0]
        partes = fecha_solo.split('/')
        if len(partes) >= 2:
            val1 = int(partes[0])
            val2 = int(partes[1])
            # Si el primer valor es > 12, es el día (DD/MM/YYYY)
            if val1 > 12:
                return val1 > 1
            # Si el segundo valor es > 12, es el día (MM/DD/YYYY)
            if val2 > 12:
                return val2 > 1
            # Si ambos son <= 12, por defecto en el formato US (MM/DD/YYYY) el segundo es el día
            return val2 > 1
    except Exception as e:
        print(f"Error al verificar fecha {fecha_str}: {e}")
    return True

app = Flask(__name__)

# Configuracion de tu Evolution API
# Reemplaza estas variables con tus datos reales de la API
EVOLUTION_API_URL = "https://evolution.regiontamaulipas.com.mx" # URL de tu Evolution API (cambiar si esta en otro lado)
INSTANCE_NAME = "boTI" # El nombre de tu instancia en Evolution API
API_KEY = "EvAPI_2026_Key!" # La Global API Key de Evolution API

def enviar_mensaje_whatsapp(numero, texto):
    """Envia un mensaje de texto usando Evolution API"""
    url = f"{EVOLUTION_API_URL}/message/sendText/{INSTANCE_NAME}"
    headers = {
        "apikey": API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "number": numero,
        "text": texto
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        print(f"Mensaje enviado a {numero}. Status: {response.status_code}")
    except Exception as e:
        print(f"Error al enviar mensaje: {e}")

@app.route('/webhook', methods=['POST'])
def webhook():
    # Recibir los datos de Evolution API
    data = request.json
    
    # Asegurarnos de que es un evento de nuevo mensaje (messages.upsert)
    if data and data.get('event') == 'messages.upsert':
        # Evolution API a veces manda mensajes que nosotros mismos enviamos (fromMe=True), los ignoramos
        msg_data = data.get('data', {})
        
        # Estructura del mensaje en Evolution API v2
        remote_jid = msg_data.get('key', {}).get('remoteJid', '')
        from_me = msg_data.get('key', {}).get('fromMe', False)
        
        # Ignoramos mensajes de grupos o enviados por el propio bot
        if from_me or "@g.us" in remote_jid:
            return jsonify({"status": "ignored"}), 200

        # Extraer el texto del mensaje recibido
        mensaje_recibido = ""
        message_obj = msg_data.get('message', {})
        if 'conversation' in message_obj:
            mensaje_recibido = message_obj['conversation']
        elif 'extendedTextMessage' in message_obj:
            mensaje_recibido = message_obj['extendedTextMessage'].get('text', '')

        mensaje_recibido = mensaje_recibido.strip().lower()
        print(f"Mensaje recibido de {remote_jid}: {mensaje_recibido}")

        # Lógica del menú
        if mensaje_recibido == "1":
            enviar_mensaje_whatsapp(remote_jid, "⏳ Ejecutando extraccion de 'Enlaces Fuera'... esto tomara unos segundos.")
            
            try:
                # Aqui llamamos a nuestro robot de Playwright
                datos = extraer_reporte_generico()
                
                # Filtrar incidentes con fecha de inicio mayor al día 1 del mes
                datos_filtrados = [d for d in datos if es_fecha_mayor_a_uno(d.get('Hora de Inicio', ''))]
                
                if not datos_filtrados:
                    enviar_mensaje_whatsapp(remote_jid, "No hay afectacion de momento")
                else:
                    # Formatear los datos para que se vean bonitos en WhatsApp: sitio, tipo de enlace y caido desde
                    respuesta = "*REPORTE DE ENLACES FUERA*\n\n"
                    for d in datos_filtrados:
                        respuesta += f"📍 *Sitio:* {d['Sitio']}\n"
                        respuesta += f"🔌 *Tipo de Enlace:* {d['Tipo de Enlace']}\n"
                        respuesta += f"⏳ *Caído desde:* {d['Hora de Inicio']}\n"
                        respuesta += "------------------------\n"
                    
                    enviar_mensaje_whatsapp(remote_jid, respuesta)
            except Exception as e:
                print(f"Error en scraper: {e}")
                enviar_mensaje_whatsapp(remote_jid, "❌ Ocurrio un error al extraer la informacion del portal.")
                
        elif mensaje_recibido == "2":
            enviar_mensaje_whatsapp(remote_jid, "⏳ Ejecutando extraccion de 'Eolicos Fuera'... esto tomara unos segundos.")
            
            try:
                # Aqui llamamos a nuestro robot de Playwright para eolicos
                datos = extraer_reporte_eolico()
                
                # Filtrar incidentes con fecha de inicio mayor al día 1 del mes
                datos_filtrados = [d for d in datos if es_fecha_mayor_a_uno(d.get('Hora de Inicio', ''))]
                
                if not datos_filtrados:
                    enviar_mensaje_whatsapp(remote_jid, "No hay afectacion de momento")
                else:
                    # Formatear los datos para que se vean bonitos en WhatsApp: sitio y caido desde
                    respuesta = "*REPORTE DE EOLICOS FUERA*\n\n"
                    for d in datos_filtrados:
                        respuesta += f"📍 *Sitio:* {d['Sitio']}\n"
                        respuesta += f"⏳ *Caído desde:* {d['Hora de Inicio']}\n"
                        respuesta += "------------------------\n"
                    
                    enviar_mensaje_whatsapp(remote_jid, respuesta)
            except Exception as e:
                print(f"Error en scraper eolicos: {e}")
                enviar_mensaje_whatsapp(remote_jid, "❌ Ocurrio un error al extraer la informacion del portal.")
                
        else:
            # Respuesta por defecto (el Menú principal)
            menu = (
                "👋 Hola, ¿Con que informacion puedo apoyarte?\n\n"
                "1️⃣ Enlaces Fuera\n"
                "2️⃣ Eolicos Fuera\n"
                "3️⃣ Movilidad Fuera"
            )
            enviar_mensaje_whatsapp(remote_jid, menu)

    return jsonify({"status": "success"}), 200

if __name__ == '__main__':
    # Arrancamos el servidor Flask en el puerto 5000
    print("Iniciando Servidor Webhook en el puerto 5000...")
    app.run(host='0.0.0.0', port=5000)
