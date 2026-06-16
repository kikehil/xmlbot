from playwright.sync_api import sync_playwright
import time

def extraer_reporte_generico():
    with sync_playwright() as p:
        directorio_sesion = "./sesion_guardada"
        
        browser = p.chromium.launch_persistent_context(
            user_data_dir=directorio_sesion,
            headless=True 
        )
        page = browser.pages[0] if browser.pages else browser.new_page()

        # PASO 1: Entrar a la principal para refrescar el SSO de Microsoft
        url_portal = "https://mrt.oxxo.com/Principal.aspx"
        print(f"Refrescando sesion en la principal...")
        page.goto(url_portal)
        
        # Esperamos a que aparezca la palabra MONITOREO para asegurar que ya entramos
        page.wait_for_selector("text=MONITOREO")

        # PASO 2: Ahora sí, ya con la sesion activa, saltamos al reporte
        url_reporte = "https://mrt.oxxo.com/DispTien_EnlaceFueraTR.aspx" 
        print(f"Navegando al reporte: {url_reporte}")
        page.goto(url_reporte)
        
        # Esperar a que la tabla cargue
        print("Esperando a que aparezca la tabla...")
        page.wait_for_selector("table.dataTable tbody tr")

        # Extraccion de Datos
        print("Extrayendo informacion...")
        filas = page.locator("table.dataTable tbody tr").all()
        
        datos_extraidos = []
        for fila in filas:
            celdas = fila.locator("td").all()
            if len(celdas) >= 8:
                registro = {
                    "Sitio": celdas[0].inner_text().strip(),
                    "Incidente": celdas[1].inner_text().strip(),
                    "Hostname": celdas[2].inner_text().strip(),
                    "Tipo de Enlace": celdas[3].inner_text().strip(),
                    "Proveedor": celdas[4].inner_text().strip(),
                    "IP Gateway": celdas[5].inner_text().strip(),
                    "IP Monitoreo": celdas[6].inner_text().strip(),
                    "Hora de Inicio": celdas[7].inner_text().strip(),
                }
                datos_extraidos.append(registro)

        for dato in datos_extraidos:
            print(dato)

        print(f"Total de registros extraidos: {len(datos_extraidos)}")
        
        browser.close()
        return datos_extraidos

def extraer_reporte_eolico():
    with sync_playwright() as p:
        directorio_sesion = "./sesion_guardada"
        
        browser = p.chromium.launch_persistent_context(
            user_data_dir=directorio_sesion,
            headless=True 
        )
        page = browser.pages[0] if browser.pages else browser.new_page()

        # PASO 1: Entrar a la principal para refrescar el SSO de Microsoft
        url_portal = "https://mrt.oxxo.com/Principal.aspx"
        print(f"Refrescando sesion en la principal...")
        page.goto(url_portal)
        
        # Esperamos a que aparezca la palabra MONITOREO para asegurar que ya entramos
        page.wait_for_selector("text=MONITOREO")

        # PASO 2: Navegar al reporte de Eolicos
        url_reporte = "https://mrt.oxxo.com/Eolico_EnlacesFueraTR.aspx#no-back-button" 
        print(f"Navegando al reporte: {url_reporte}")
        page.goto(url_reporte)
        
        # Esperar a que la tabla cargue
        print("Esperando a que aparezca la tabla...")
        page.wait_for_selector("table.dataTable tbody tr")

        # Extraccion de Datos
        print("Extrayendo informacion...")
        filas = page.locator("table.dataTable tbody tr").all()
        
        datos_extraidos = []
        for fila in filas:
            celdas = fila.locator("td").all()
            if len(celdas) >= 7:
                registro = {
                    "Sitio": celdas[0].inner_text().strip(),
                    "Incidente": celdas[1].inner_text().strip(),
                    "Hostname": celdas[2].inner_text().strip(),
                    "Proveedor": celdas[3].inner_text().strip(),
                    "IP Gateway": celdas[4].inner_text().strip(),
                    "Tipo de Enlace": celdas[5].inner_text().strip(),
                    "Hora de Inicio": celdas[6].inner_text().strip(),
                }
                datos_extraidos.append(registro)

        for dato in datos_extraidos:
            print(dato)

        print(f"Total de registros eolicos extraidos: {len(datos_extraidos)}")
        
        browser.close()
        return datos_extraidos

if __name__ == "__main__":
    print("Probando reporte generico...")
    extraer_reporte_generico()
    print("\nProbando reporte eolico...")
    extraer_reporte_eolico()