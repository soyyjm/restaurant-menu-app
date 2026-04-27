// v13.0 - DeepL Integration & UX Improvements
document.addEventListener('DOMContentLoaded', () => {

    // ================== 配置与常量 ==================
    // ⚠️ 在这里填入你的 DeepL API KEY
    const DEEPL_API_KEY = '1f098607-0e08-4364-ba45-0f6d393cbc2f:fx'; 

    const SUPABASE_URL = 'https://nkteqmgslcrqiglzcsyv.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rdGVxbWdzbGNycWlnbHpjc3l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwMzE4NzMsImV4cCI6MjA3MTYwNzg3M30.XmyXU4LAUYorfwsXjEEjHQsOHDWGa3gESxu2xq3XPm0';
    
    let supabase, isCloudMode = false;
    let dishes = [];
    let selectedDishes = { primer: [], segundo: [], postre: [] };
    let collapseState = JSON.parse(localStorage.getItem('collapseState') || '{}');
    let printSettings = JSON.parse(localStorage.getItem('printSettings') || '{"mainEs":13,"mainCa":11,"postreEs":12,"postreCa":11,"sectionMargin":18,"itemMargin":10,"titleSize":32,"titleAlign":"center","sectionTitleSize":16,"sectionTitleAlign":"left"}');
    let editState = { isEditing: false, dishId: null, source: null, sourceCategory: null };
    let subcategories = { primer: [], segundo: [] };
    let activeSelection = { id: null, type: null, category: null };

    // 智能纠错字典 (餐饮专用版 - 包含300+常用词)
    const accentMap = {
        // --- 通用 & 格式 ---
        'menu': 'menú', 'dia': 'día', 'frio': 'frío', 'caliente': 'caliente',
        'casero': 'casero', 'exito': 'éxito', 'numero': 'número',
        'senor': 'señor', 'senora': 'señora', 'senorit': 'señorito',
        'nino': 'niño', 'nina': 'niña', 'pequeno': 'pequeño',
        'mas': 'más', 'solo': 'sólo', 'con': 'con', 'sin': 'sin',
        'y': 'y', 'o': 'o', 'de': 'de', 'del': 'del', 'la': 'la', 'el': 'el',

        // --- 肉类 (Carnes) ---
        'jamon': 'jamón', 'lomo': 'lomo', 'bacon': 'bacon', 'panceta': 'panceta',
        'pollo': 'pollo', 'pechuga': 'pechuga', 'muslo': 'muslo', 'alitas': 'alitas',
        'ternera': 'ternera', 'buey': 'buey', 'vaca': 'vaca', 'entrecot': 'entrecot',
        'chuleton': 'chuletón', 'solomillo': 'solomillo', 'costilla': 'costilla',
        'cerdo': 'cerdo', 'iberico': 'ibérico', 'secreto': 'secreto', 'presa': 'presa',
        'pluma': 'pluma', 'lagarto': 'lagarto', 'carne': 'carne', 'hamburguesa': 'hamburguesa',
        'albondigas': 'albóndigas', 'conejo': 'conejo', 'pato': 'pato', 'pavo': 'pavo',
        'chorizo': 'chorizo', 'salchicha': 'salchicha', 'longaniza': 'longaniza',
        'morcilla': 'morcilla', 'sobrasada': 'sobrasada', 'fuet': 'fuet',
        'callos': 'callos', 'manitas': 'manitas', 'higado': 'hígado',

        // --- 海鲜 (Pescados y Mariscos) ---
        'pescado': 'pescado', 'marisco': 'marisco', 'salmon': 'salmón',
        'atun': 'atún', 'bonito': 'bonito', 'emperador': 'emperador',
        'bacalao': 'bacalao', 'merluza': 'merluza', 'rape': 'rape',
        'dorada': 'dorada', 'lubina': 'lubina', 'sardina': 'sardina',
        'boqueron': 'boquerón', 'boquerones': 'boquerones', 'anchoa': 'anchoa',
        'calamar': 'calamar', 'calamares': 'calamares', 'sepia': 'sepia',
        'pulpo': 'pulpo', 'chipiron': 'chipirón', 'chipirones': 'chipirones',
        'gamba': 'gamba', 'gambas': 'gambas', 'langostino': 'langostino',
        'cigala': 'cigala', 'bogavante': 'bogavante', 'mejillon': 'mejillón',
        'mejillones': 'mejillones', 'almeja': 'almeja', 'almejas': 'almejas',
        'navaja': 'navaja', 'navajas': 'navajas', 'zamburina': 'zamburiña',

        // --- 蔬菜与植物 (Verduras) ---
        'ensalada': 'ensalada', 'tomate': 'tomate', 'lechuga': 'lechuga',
        'cebolla': 'cebolla', 'ajo': 'ajo', 'pimiento': 'pimiento',
        'padron': 'padrón', 'calabacin': 'calabacín', 'calabaza': 'calabaza',
        'berenjena': 'berenjena', 'patata': 'patata', 'papa': 'papa',
        'bravas': 'bravas', 'zanahoria': 'zanahoria', 'esparrago': 'espárrago',
        'esparragos': 'espárragos', 'alcachofa': 'alcachofa', 'alcachofas': 'alcachofas',
        'seta': 'seta', 'setas': 'setas', 'hongo': 'hongo', 'hongos': 'hongos',
        'boletus': 'boletus', 'niscalo': 'níscalo', 'champi': 'champiñón',
        'champinon': 'champiñón', 'champinones': 'champiñones', 'trufa': 'trufa',
        'espinaca': 'espinaca', 'acelga': 'acelga', 'judia': 'judía',
        'judias': 'judías', 'verde': 'verde', 'guisante': 'guisante',
        'habas': 'habas', 'lentejas': 'lentejas', 'garbanzos': 'garbanzos',
        'arroz': 'arroz', 'paella': 'paella', 'fideua': 'fideuá',
        'couscous': 'cuscús', 'quinoa': 'quinoa', 'basmati': 'basmati',
        'maiz': 'maíz', 'brocoli': 'brócoli', 'coliflor': 'coliflor',
        'puerro': 'puerro', 'apio': 'apio', 'canonigos': 'canónigos',
        'rucula': 'rúcula', 'aguacate': 'aguacate', 'limon': 'limón',
        'naranja': 'naranja', 'pina': 'piña', 'melon': 'melón',
        'sandia': 'sandía', 'platano': 'plátano', 'fresa': 'fresa',
        'fruta': 'fruta', 'arandano': 'arándano', 'almendra': 'almendra',
        'nuez': 'nuez', 'piñones': 'piñones', 'datil': 'dátil',

        // --- 乳制品与蛋 (Lácteos y Huevos) ---
        'huevo': 'huevo', 'huevos': 'huevos', 'tortilla': 'tortilla',
        'revuelto': 'revuelto', 'clara': 'clara', 'yema': 'yema',
        'queso': 'queso', 'manchego': 'manchego', 'cabra': 'cabra',
        'azul': 'azul', 'brie': 'brie', 'camembert': 'camembert',
        'roquefort': 'roquefort', 'gorgonzola': 'gorgonzola',
        'mozzarella': 'mozzarella', 'parmesano': 'parmesano',
        'nata': 'nata', 'leche': 'leche', 'yogur': 'yogur',
        'mantequilla': 'mantequilla', 'bechamel': 'bechamel',

        // --- 烹饪方式 (Cocción) ---
        'plancha': 'plancha', 'brasa': 'brasa', 'horno': 'horno',
        'frito': 'frito', 'asado': 'asado', 'cocido': 'cocido',
        'guisado': 'guisado', 'estofado': 'estofado', 'vapor': 'vapor',
        'gratinado': 'gratinado', 'rebozado': 'rebozado', 'romana': 'romana',
        'andaluza': 'andaluza', 'gallega': 'gallega', 'riojana': 'riojana',
        'marinera': 'marinera', 'jardinera': 'jardinera', 'vizcaina': 'vizcaína',
        'salsa': 'salsa', 'alioli': 'alioli', 'brava': 'brava',
        'mayonesa': 'mayonesa', 'vinagreta': 'vinagreta', 'soja': 'soja',
        'miel': 'miel', 'mostaza': 'mostaza', 'pimienta': 'pimienta',
        'sal': 'sal', 'azucar': 'azúcar', 'aceite': 'aceite',
        'vinagre': 'vinagre', 'oregano': 'orégano', 'perejil': 'perejil',
        'albahaca': 'albahaca', 'romero': 'romero', 'tomillo': 'tomillo',
        'comino': 'comino', 'canela': 'canela', 'azafran': 'azafrán',
        'curry': 'curry', 'picante': 'picante', 'agridulce': 'agridulce',
        
        // --- 甜点 (Postres) ---
        'tarta': 'tarta', 'pastel': 'pastel', 'bizcocho': 'bizcocho',
        'helado': 'helado', 'flan': 'flan', 'natillas': 'natillas',
        'crema': 'crema', 'catalana': 'catalana', 'arroz': 'arroz',
        'leche': 'leche', 'frita': 'frita', 'coulis': 'coulis',
        'chocolate': 'chocolate', 'turron': 'turrón', 'cafe': 'café',
        'te': 'té', 'infusion': 'infusión', 'copa': 'copa',
        'sorbete': 'sorbete', 'tiramisu': 'tiramisú', 'coulant': 'coulant',
        'brownie': 'brownie', 'cheesecake': 'cheesecake', 'profiteroles': 'profiteroles'
    };

    const $ = (id) => document.getElementById(id);

    // ================== 初始化 ==================
    async function initializeApp() {
        createToastContainer();
        createFab();

        try {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            isCloudMode = true;
        } catch (e) {
            updateSyncStatus('error', 'Modo Local');
        }
        await loadData();
        setupEventListeners();
        setDateAndPrice();
        initPrintControls();
        renderAll();
    }

    function createFab() {
        if ($('preview-toggle-fab')) return;
        const fab = document.createElement('button');
        fab.id = 'preview-toggle-fab';
        fab.innerHTML = '🖨️';
        document.body.appendChild(fab);
    }
    
    function createToastContainer() {
        const div = document.createElement('div');
        div.className = 'toast-container';
        div.id = 'toast-container';
        document.body.appendChild(div);
    }

    function showToast(message, type = 'info') {
        const container = $('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'error') icon = '⚠️';
        
        toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function setupEventListeners() {
        document.body.addEventListener('click', handleGlobalClick);
        document.body.addEventListener('input', handleGlobalInput);
        document.body.addEventListener('focusout', (e) => {
            if (e.target.dataset.action === 'rename-subcategory-input') {
                handleGlobalClick(e);
            }
        });

        // 核心：输入框失去焦点时，自动纠错 + 自动翻译
        $('unifiedSpanish').addEventListener('keydown', async (e) => {
    // 监听回车键 (Enter)
    if (e.key === 'Enter') {
        e.preventDefault(); // 防止默认换行行为

        // 1. 第一步：先进行自动纠错 (比如把 jamon 改为 Jamón)
        autocorrectField(e.target);

        // 2. 第二步：如果没有填加泰语，或者想强制更新，就触发翻译
        //    同时让焦点保持在西班牙语框，或者跳到加泰语框（根据你习惯）
        //    这里设计为：翻译完自动跳到加泰语框方便检查
        const catInput = $('unifiedCatalan');
        
        // 显示加载状态
        catInput.placeholder = "⏳ Traduciendo...";
        
        // 调用 Google 翻译
        await autoTranslate(e.target, catInput);
        
        // 3. 翻译完成后，光标跳过去
        catInput.focus();
    }
});

        $('unifiedSpanish').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') $('unifiedCatalan').focus();
        });

        $('menuDate').addEventListener('change', () => { setDateAndPrice(); renderPreviewPanel(); });
        $('unifiedCategory').addEventListener('change', handleCategoryChange);
        $('preview-toggle-fab').addEventListener('click', togglePreviewPanel);
        setupDragAndDrop();
    }

    // ================== DeepL 翻译 & 纠错逻辑 ==================
    
    // 1. 自动纠错
    function autocorrectSpanish(text) {
        if (!text) return text;
        let words = text.split(' ');
        
        const correctedWords = words.map(word => {
            // 移除标点符号进行匹配
            const cleanWord = word.replace(/[.,;:]/g, '').toLowerCase();
            const punctuation = word.match(/[.,;:]/g) ? word.match(/[.,;:]/g)[0] : '';
            
            if (accentMap[cleanWord]) {
                const replacement = accentMap[cleanWord];
                // 保持首字母大小写
                if (word[0] === word[0].toUpperCase()) {
                    return replacement.charAt(0).toUpperCase() + replacement.slice(1) + punctuation;
                }
                return replacement + punctuation;
            }
            return word;
        });
        
        let result = correctedWords.join(' ');
        // 确保整个句子的首字母大写
        return result.charAt(0).toUpperCase() + result.slice(1);
    }

    function autocorrectField(input) {
        const original = input.value;
        const corrected = autocorrectSpanish(original);
        if (original !== corrected) {
            input.value = corrected;
            // 可选：添加一点视觉反馈表示已纠正
            input.style.backgroundColor = '#f0fff4';
            setTimeout(() => input.style.backgroundColor = '', 500);
        }
    }

// 🔵 方案二：Google 翻译版 (无需 Key，免费且稳定)
async function autoTranslate(sourceInput, targetInput) {
    const text = sourceInput.value.trim();
    if (!text) return;

    // UI 状态反馈
    targetInput.classList.add('input-loading');
    targetInput.placeholder = "Google Translating...";

    try {
        // 构建请求 URL
        // client=gtx: Google 这里的通用客户端标识
        // sl=es: 源语言 (西班牙语)
        // tl=ca: 目标语言 (加泰罗尼亚语)
        // dt=t: 返回类型为文本
        // q=...: 要翻译的内容
        const url = `/api-proxy/single?client=gtx&sl=es&tl=ca&dt=t&q=${encodeURIComponent(text)}`;

        const response = await fetch(url);

        if (!response.ok) throw new Error(`Google Error: ${response.status}`);

        const data = await response.json();
        
        // Google 返回的数据结构比较复杂: [[["Traducción", "Original", ...]], ...]
        // 我们需要提取第一段的第一句
        if (data && data[0] && data[0][0] && data[0][0][0]) {
            let translatedText = data[0][0][0];
            
            // 简单的后处理：修正标点空格
            translatedText = translatedText.replace(' ,', ',').replace(' .', '.');
            
            targetInput.value = translatedText;
            showToast('Traducido con Google', 'success');
        } else {
            throw new Error('Formato desconocido');
        }

    } catch (e) {
        console.error("Google Translate Failed:", e);
        showToast('Error de conexión', 'error');
        // 如果连 Google 都挂了，回退到本地简单词典
        targetInput.value = simpleFallbackTranslate(text);
    } finally {
        targetInput.classList.remove('input-loading');
        targetInput.placeholder = "Ej: Paella del senyoret...";
    }
}    function simpleFallbackTranslate(text) {
        // 这是一个极简的后备方案，防止 API 挂了完全没反应
        const fallbackMap = {'pollo':'pollastre','jamón':'pernil','queso':'formatge','con':'amb','y':'i','de':'de'};
        return text.split(' ').map(w => fallbackMap[w.toLowerCase()] || w).join(' ');
    }
    
    function cleanTranslation(text) {
        // DeepL 已经很好，这里只做微调
        return text.replace(/\s+/g, ' ').trim();
    }

    // ================== UI 辅助函数 ==================
    function togglePreviewPanel() {
        const container = document.querySelector('.container');
        const fab = $('preview-toggle-fab');
        container.classList.toggle('preview-hidden');
        const isPreviewVisible = !container.classList.contains('preview-hidden');
        fab.innerHTML = isPreviewVisible ? '✏️' : '🖨️';
        fab.title = isPreviewVisible ? 'Volver al Editor' : 'Mostrar Vista Previa';
    }

    function handleSelection(target) {
        const dbItem = target.closest('.dish-item');
        const menuItem = target.closest('.selected-dish');
        let newSelection = { id: null, type: null, category: null };

        if (dbItem) { newSelection = { id: parseInt(dbItem.dataset.dishId), type: 'db' }; } 
        else if (menuItem) { newSelection = { id: parseInt(menuItem.dataset.dishId), type: 'menu', category: menuItem.dataset.category }; }

        if (newSelection.id && newSelection.id === activeSelection.id) {
            clearSelection();
        } else {
            activeSelection = newSelection;
        }
        renderDatabasePanel();
        renderMenuBuilderPanel();
    }

    function clearSelection() {
        activeSelection = { id: null, type: null, category: null };
    }
    
    function triggerFlash(dishId) {
        const elements = document.querySelectorAll(`[data-dish-id="${dishId}"]`);
        elements.forEach(element => {
            element.classList.add('item-flash');
            setTimeout(() => element.classList.remove('item-flash'), 500);
        });
    }

    // ================== 数据与同步 ==================
    async function loadData() { 
        if (!isCloudMode) { 
            dishes = JSON.parse(localStorage.getItem('restaurantDishes') || '[]'); 
            selectedDishes = JSON.parse(localStorage.getItem('selectedDishes') || '{"primer":[],"segundo":[],"postre":[]}'); 
            printSettings = JSON.parse(localStorage.getItem('printSettings') || JSON.stringify(printSettings)); 
            subcategories = JSON.parse(localStorage.getItem('subcategories') || '{"primer":[],"segundo":[]}'); 
            return; 
        } 
        try { 
            updateSyncStatus('syncing', '🔄 Sincronizando...'); 
            const [dishesResponse, menuResponse, settingsResponse] = await Promise.all([ 
                supabase.from('dishes').select('*').order('order_index', { ascending: true, nullsFirst: true }).order('created_at', { ascending: false }), 
                supabase.from('selected_menu').select('*').single(), 
                supabase.from('settings').select('print_settings, subcategories').eq('id', 1).single() 
            ]); 
            if (dishesResponse.error) throw dishesResponse.error; 
            dishes = dishesResponse.data || []; 
            selectedDishes = (menuResponse.data && menuResponse.data.dishes) ? { primer: [], segundo: [], postre: [], ...menuResponse.data.dishes } : { primer: [], segundo: [], postre: [] }; 
            if (settingsResponse.data) { 
                if (settingsResponse.data.print_settings) printSettings = { ...printSettings, ...settingsResponse.data.print_settings }; 
                subcategories = { primer: [], segundo: [], ...(settingsResponse.data.subcategories || {}) }; 
            } else { saveSettings(); } 
            localStorage.setItem('printSettings', JSON.stringify(printSettings)); 
            localStorage.setItem('subcategories', JSON.stringify(subcategories)); 
            updateSyncStatus('synced', '☁️ Sincronizado'); 
        } catch (e) { 
            console.error("Cloud load failed:", e); 
            updateSyncStatus('error', '⚠️ Fallo Sync'); 
            isCloudMode = false; 
            loadData(); 
        } 
    }

    async function saveData() { 
        localStorage.setItem('restaurantDishes', JSON.stringify(dishes)); 
        localStorage.setItem('selectedDishes', JSON.stringify(selectedDishes)); 
        if (!isCloudMode) return; 
        try { 
            updateSyncStatus('syncing', '🔄 Guardando...'); 
            // 简化同步逻辑：仅更新变动部分通常更复杂，这里为了稳定性保持全量检查
            if (dishes.length > 0) { 
                const dishUpserts = dishes.map((d, index) => ({ ...d, id: d.id || Date.now() + Math.random(), updated_at: new Date().toISOString(), order_index: index })); 
                const { error } = await supabase.from('dishes').upsert(dishUpserts, { onConflict: 'id' }); 
                if(error) throw error; 
            } 
            await supabase.from('selected_menu').upsert({ id: 1, dishes: selectedDishes, updated_at: new Date().toISOString() }); 
            updateSyncStatus('synced', '☁️ Sincronizado'); 
        } catch (e) { 
            console.error("Cloud save failed:", e); 
            updateSyncStatus('error', '⚠️ Error Guardar'); 
        } 
    }

    async function saveSettings() { 
        localStorage.setItem('printSettings', JSON.stringify(printSettings)); 
        localStorage.setItem('subcategories', JSON.stringify(subcategories)); 
        if (!isCloudMode) return; 
        try { 
            const { error } = await supabase.from('settings').upsert({ id: 1, print_settings: printSettings, subcategories: subcategories }, { onConflict: 'id' }); 
            if (error) throw error; 
        } catch (e) { console.error("Settings save failed:", e); } 
    }
    
    const debounce = (func, delay) => { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), delay); }; };
    const debouncedSaveSettings = debounce(saveSettings, 1000);

    // ================== 渲染逻辑 ==================
    function renderAll() {
        renderUnifiedInputArea();
        renderDatabasePanel();
        renderMenuBuilderPanel();
        renderPreviewPanel();
    }
    
    function getControlsHtml(action) {
        return `<div class="context-controls">
            <button class="btn-arrow" data-action="${action}" data-direction="up" title="Subir">▲</button>
            <button class="btn-arrow" data-action="${action}" data-direction="down" title="Bajar">▼</button>
        </div>`;
    }

    function renderDatabasePanel() {
        const categories = { primer: 'PRIMER PLATO', segundo: 'SEGUNDO PLATO', postre: 'POSTRES' };
        let html = '';
        const selectedDish = activeSelection.type === 'db' ? findDishById(activeSelection.id) : null;

        for (const category in categories) {
            const isExpanded = collapseState[`db-${category}`] !== false;
            const categoryDishes = dishes.filter(d => d.category === category);
            let contentHtml = '';
            
            if (category !== 'postre') {
                const dishesInRoot = categoryDishes.filter(d => !d.subcategory || d.subcategory === '');
                if (dishesInRoot.length > 0) contentHtml += dishesInRoot.map(dishToDishItemHtml).join('');

                const subcats = [...(subcategories[category] || [])].sort();
                subcats.forEach(subcat => {
                    const dishesInSubcat = categoryDishes.filter(d => d.subcategory === subcat);
                    if (dishesInSubcat.length === 0) return;
                    
                    const isSubExpanded = collapseState[`db-${category}-${subcat}`] !== false;
                    const controls = selectedDish && selectedDish.category === category && selectedDish.subcategory === subcat ? getControlsHtml('move-active-db-item') : '';
                    
                    contentHtml += `<div class="subcategory-section">
                        <div class="section-header subcategory-header" data-collapse-id="db-${category}-${subcat}" data-drop-target-category="${category}" data-drop-target-subcategory="${subcat}">
                            <h4>${subcat} (${dishesInSubcat.length})</h4>
                            ${controls}
                            <div class="title-wrapper"><span class="rotate-icon ${isSubExpanded ? 'rotated' : ''}">▶</span></div>
                        </div>
                        <div class="section-content subcategory-dishes ${isSubExpanded ? 'expanded' : ''}" data-content-id="db-${category}-${subcat}">
                            ${dishesInSubcat.map(dishToDishItemHtml).join('')}
                        </div>
                    </div>`;
                });
            } else { 
                 contentHtml = `<div class="dessert-grid">${categoryDishes.map(dishToDessertChipHtml).join('')}</div>`;
            }

            const mainControls = selectedDish && selectedDish.category === category && (!selectedDish.subcategory || selectedDish.subcategory === '') ? getControlsHtml('move-active-db-item') : '';
            html += `<div class="collapsible-section ${isExpanded ? 'is-expanded' : ''}">
                <div class="section-header" data-collapse-id="db-${category}" data-drop-target-category="${category}" data-drop-target-subcategory="">
                    <h3>${categories[category]} (${categoryDishes.length})</h3>
                    ${mainControls}
                    <div class="title-wrapper"><span class="rotate-icon ${isExpanded ? 'rotated' : ''}">▶</span></div>
                </div>
                <div class="section-content ${isExpanded ? 'expanded' : ''}" data-content-id="db-${category}">
                    ${contentHtml}
                </div>
            </div>`;
        }
        $('dishesContainer').innerHTML = html;
    }

    function renderMenuBuilderPanel() {
        const categories = { primer: 'PRIMER PLATO', segundo: 'SEGUNDO PLATO', postre: 'POSTRES' };
        let html = '';
        for (const category in categories) {
            const controls = activeSelection.type === 'menu' && activeSelection.category === category ? getControlsHtml('move-active-menu-item') : '';
            html += `<div class="category-section">
                <div class="category-header">${categories[category]} ${controls}</div>
                <div class="category-dishes" data-drop-zone="${category}">
                    ${(selectedDishes[category] || []).map(dish => dishToSelectedDishHtml(dish, category)).join('') || `<div class="drop-placeholder">Arrastra o selecciona platos aquí</div>`}
                </div>
            </div>`;
        }
        $('selectedDishesContainer').innerHTML = html;
    }
    
    function renderUnifiedInputArea(){ 
        const container=$('unifiedButtonContainer'); 
        const dish=editState.isEditing?findDishById(editState.dishId):null; 
        
        if(editState.isEditing&&dish){ 
            $('unifiedSpanish').value=dish.spanish; 
            $('unifiedCatalan').value=dish.catalan; 
            $('unifiedCategory').value=dish.category; 
            $('unifiedSubcategory').value=dish.subcategory||''; 
            container.innerHTML=`<button class="btn" data-action="update-dish" title="Guardar cambios">💾 Actualizar</button><button class="btn btn-secondary" data-action="cancel-edit" title="Cancelar">❌ Cancelar</button>${editState.source==='database'?`<button class="btn btn-danger" data-action="delete-db-dish" data-dish-id="${dish.id}" style="margin-left: auto;">🗑️</button>`:''}`; 
        } else { 
            container.innerHTML=`<button class="btn" data-action="add-to-db" title="Guardar plato">✔️ Guardar en BD</button><button class="btn btn-secondary" data-action="add-to-menu-temp" title="Añadir al menú hoy">➕ Añadir al Menú</button>`; 
        } 
        handleCategoryChange(); 
    }

    function renderPreviewPanel(){ 
        const price=$('menuPrice').value; 
        const date=new Date($('menuDate').value).toLocaleDateString('es-ES',{day:'numeric',month:'long'}); 
        const categories={primer:'PRIMER PLATO',segundo:'SEGUNDO PLATO',postre:'POSTRES'}; 
        let menuHtml=`<div class="menu-header"><div class="menu-title">Menú del día</div><div style="font-style:italic;color:#666;margin-bottom:15px">Restaurante Sol</div><div class="menu-date-price"><span>${price}</span><span>${date}</span></div></div>`; 
        for(const category in categories){ 
            if(selectedDishes[category]&&selectedDishes[category].length>0){ 
                menuHtml+=`<div class="menu-section" data-category="${category}"><div class="section-title">${categories[category]}</div>`; 
                if(category==='postre'){ 
                    const spanish=selectedDishes.postre.map(d=>d.spanish).join(', '); 
                    const catalan=selectedDishes.postre.map(d=>d.catalan).join(', '); 
                    menuHtml+=`<div class="menu-item"><div class="menu-item-spanish">${spanish}</div><div class="menu-item-catalan">${catalan}</div></div>`; 
                } else { 
                    selectedDishes[category].forEach(dish=>{menuHtml+=`<div class="menu-item"><div class="menu-item-spanish">${dish.spanish}</div><div class="menu-item-catalan">${dish.catalan}</div></div>`}); 
                } 
                menuHtml+='</div>'; 
            } 
        } 
        menuHtml+='<div class="menu-hours">HORARIO DE MENÚ 13:00 - 16:00</div>'; 
        $('menuPreview').innerHTML=menuHtml; 
        applyFontStylesToPreview(); 
    }

    // ================== 事件处理 ==================
    function handleGlobalClick(e) {
        const target = e.target;
        const actionTarget = (e.type === 'focusout') ? target : target.closest('[data-action],[data-collapse-id]');

        if (target.closest('.dish-item, .selected-dish') && !target.closest('.actions, .action-icon')) {
             handleSelection(target);
        } else if (!target.closest('.panel, .modal-content, #preview-toggle-fab')) {
             clearSelection();
             renderDatabasePanel();
             renderMenuBuilderPanel();
        }

        if (!actionTarget) return;

        const { action, dishId, category, direction, collapseId, oldName } = actionTarget.dataset;
        if (collapseId) toggleCollapse(collapseId);
        if (!action) return;
        
        const actions = {
            'manage-subcategories': openSubcategoryModal, 'close-modal': closeSubcategoryModal,
            'add-subcategory': () => addSubcategory(category), 
            'delete-subcategory': () => deleteSubcategory(category, oldName),
            'rename-subcategory-input': () => renameSubcategory(actionTarget),
            'add-to-db': addDishToDb, 'add-to-menu-temp': () => addDishToMenu(true),
            'update-dish': updateDish, 'cancel-edit': cancelEdit,
            'add-to-menu': () => addDishToMenu(false, parseInt(dishId)),
            'edit-db-dish': () => startEdit(parseInt(dishId), 'database'),
            'edit-menu-dish': () => startEdit(parseInt(dishId), 'menu', category),
            'delete-db-dish': () => deleteDishFromDb(parseInt(dishId)),
            'remove-from-menu': () => removeDishFromMenu(parseInt(dishId), category),
            'move-active-db-item': () => activeSelection.id && moveDishInDb(activeSelection.id, direction),
            'move-active-menu-item': () => activeSelection.id && moveDishInMenu(activeSelection.id, activeSelection.category, direction),
            'toggle-dessert': () => toggleDessertSelection(parseInt(dishId)),
            print: printMenu, 'clear-selected': clearSelectedDishes,
            translate: () => autoTranslate($('unifiedSpanish'), $('unifiedCatalan'))
        };
        if (actions[action]) actions[action]();
    }
    
    function handleGlobalInput(e) { const id = e.target.id; const mapping = { psTitleSize: 'titleSize', psTitleAlign: 'titleAlign', psSectionTitleSize: 'sectionTitleSize', psSectionTitleAlign: 'sectionTitleAlign', psMainEs: 'mainEs', psMainCa: 'mainCa', psPostreEs: 'postreEs', psPostreCa: 'postreCa', psSectionMargin: 'sectionMargin', psItemMargin: 'itemMargin' }; if (mapping[id]) { printSettings[mapping[id]] = id.includes('Align') ? e.target.value : parseInt(e.target.value) || 0; debouncedSaveSettings(); applyFontStylesToPreview(); renderPreviewPanel(); } }
    
    function handleCategoryChange() { const category = $('unifiedCategory').value; const subcategoryContainer = $('subcategory-container'); if (category === 'primer' || category === 'segundo') { subcategoryContainer.style.visibility = 'visible'; const selectElement = $('unifiedSubcategory');
        if (subcategories[category] && selectElement) {
            const currentSub = selectElement.value;
            selectElement.innerHTML = '<option value="">-- Sin subcategoría --</option>';
            selectElement.innerHTML += (subcategories[category] || []).map(sc => `<option value="${sc}" ${sc === currentSub ? 'selected' : ''}>${sc}</option>`).join('');
        } } else { subcategoryContainer.style.visibility = 'hidden'; $('unifiedSubcategory').value = ''; } }

    async function addDishToDb(){ 
        let spanish=$('unifiedSpanish').value.trim(); 
        let catalan=$('unifiedCatalan').value.trim(); 
        let category=$('unifiedCategory').value; 
        let subcategory=(category!=='postre')?$('unifiedSubcategory').value.trim():''; 
        
        if(!spanish||!catalan) return showToast('Falta el nombre o la traducción', 'error'); 
        
        spanish=autocorrectSpanish(spanish); 
        if(dishes.some(d=>d.spanish.toLowerCase()===spanish.toLowerCase()&&d.category===category)) return showToast('Este plato ya existe', 'error'); 
        
        const newDish={id:Date.now(),spanish,catalan,category,subcategory,created_at:new Date().toISOString()}; 
        dishes.unshift(newDish); 
        
        if(category!=='postre'&&subcategory){ 
            if(!subcategories[category])subcategories[category]=[]; 
            if(!subcategories[category].includes(subcategory)){ subcategories[category].push(subcategory); await saveSettings(); } 
        } 
        await saveData(); 
        clearDishNameInputs(); 
        renderAll(); 
        showToast('Plato guardado', 'success');
    }

    async function addDishToMenu(isTemporary,dishId){ 
        let dishToAdd; 
        let category=$('unifiedCategory').value; 
        let subcategory=(category!=='postre')?$('unifiedSubcategory').value.trim():''; 
        if(isTemporary){ 
            let spanish=$('unifiedSpanish').value.trim(); 
            let catalan=$('unifiedCatalan').value.trim(); 
            if(!spanish||!catalan) return showToast('Falta el nombre', 'error'); 
            dishToAdd={id:Date.now(),spanish,catalan,category,subcategory}; 
            clearDishNameInputs(); 
        } else { 
            const foundDish=findDishById(dishId); 
            if(foundDish){ dishToAdd={...foundDish}; category=foundDish.category; } 
        } 
        if(dishToAdd){ 
            if(!selectedDishes[category]||!selectedDishes[category].some(d=>d.id===dishToAdd.id)){ 
                if(!selectedDishes[category])selectedDishes[category]=[]; 
                selectedDishes[category].push(dishToAdd); 
                await saveData(); 
                renderAll(); 
                showToast('Añadido al menú', 'success');
            } else {
                showToast('Ya está en el menú', 'info');
            }
        } 
    }
    
    async function updateDish() {
        if (!editState.isEditing) return;
        const newSpanish = autocorrectSpanish($('unifiedSpanish').value.trim());
        const newCatalan = $('unifiedCatalan').value.trim();
        const newCategory = $('unifiedCategory').value;
        const newSubcategory = (newCategory !== 'postre') ? $('unifiedSubcategory').value.trim() : '';

        if (editState.source === 'menu') {
            const categoryList = selectedDishes[editState.sourceCategory];
            const dishIndex = categoryList.findIndex(d => d.id === editState.dishId);
            if (dishIndex > -1) {
                const updatedDish = { ...categoryList[dishIndex], spanish: newSpanish, catalan: newCatalan };
                if (newCategory !== editState.sourceCategory) {
                    categoryList.splice(dishIndex, 1);
                    if (!selectedDishes[newCategory]) selectedDishes[newCategory] = [];
                    selectedDishes[newCategory].push(updatedDish);
                } else { categoryList[dishIndex] = updatedDish; }
            }
        } else {
            const dish = findDishById(editState.dishId);
            if (!dish) return cancelEdit();
            dish.spanish = newSpanish; dish.catalan = newCatalan; dish.category = newCategory; dish.subcategory = newSubcategory;
            if (newCategory !== 'postre' && newSubcategory && !(subcategories[newCategory] || []).includes(newSubcategory)) {
                if (!subcategories[newCategory]) subcategories[newCategory] = [];
                subcategories[newCategory].push(newSubcategory);
                await saveSettings();
            }
        }
        await saveData();
        editState = { isEditing: false, dishId: null, source: null, sourceCategory: null };
        clearDishNameInputs();
        renderAll();
        showToast('Plato actualizado', 'success');
    }

    function startEdit(dishId, source, sourceCategory = null) {
        editState = { isEditing: true, dishId, source, sourceCategory };
        const dishToEdit = findDishInSource(dishId, source, sourceCategory);
        if (dishToEdit) {
            $('unifiedSpanish').value = dishToEdit.spanish;
            $('unifiedCatalan').value = dishToEdit.catalan;
            $('unifiedCategory').value = dishToEdit.category;
            handleCategoryChange();
            $('unifiedSubcategory').value = dishToEdit.subcategory || '';
        }
        renderUnifiedInputArea();
        $('unifiedSpanish').focus();
    }
    
    function cancelEdit(){ editState={isEditing:false,dishId:null,source:null,sourceCategory:null}; clearAndResetInput(); renderAll(); }
    
    function clearAndResetInput(){ $('unifiedSpanish').value=''; $('unifiedCatalan').value=''; $('unifiedSubcategory').value=''; $('unifiedCategory').value='primer'; handleCategoryChange(); }
    function clearDishNameInputs() { $('unifiedSpanish').value = ''; $('unifiedCatalan').value = ''; $('unifiedSpanish').focus(); }
    
    async function deleteDishFromDb(dishId){ 
        if(confirm('¿Seguro que quieres eliminar este plato?')){ 
            dishes=dishes.filter(d=>d.id!==dishId); 
            for(const category in selectedDishes){ selectedDishes[category]=(selectedDishes[category]||[]).filter(d=>d.id!==dishId); } 
            await saveData(); 
            if(editState.dishId===dishId)cancelEdit(); else renderAll(); 
            showToast('Plato eliminado', 'success');
        } 
    }
    
    async function removeDishFromMenu(dishId,category){ selectedDishes[category]=selectedDishes[category].filter(d=>d.id!==dishId); await saveData(); renderAll(); }
    
    async function moveDishInMenu(dishId, category, direction) {
        const list = selectedDishes[category];
        const index = list.findIndex(d => d.id === dishId);
        let moved = false;
        if (direction === 'up' && index > 0) { [list[index - 1], list[index]] = [list[index], list[index - 1]]; moved = true; } 
        else if (direction === 'down' && index < list.length - 1) { [list[index + 1], list[index]] = [list[index], list[index + 1]]; moved = true; }
        if (moved) { await saveData(); renderMenuBuilderPanel(); renderPreviewPanel(); setTimeout(() => triggerFlash(dishId), 50); }
    }

    async function moveDishInDb(dishId, direction) {
        const targetDish = findDishById(dishId);
        if (!targetDish) return;
        const siblingDishes = dishes.filter(d => d.category === targetDish.category && (d.subcategory || '') === (targetDish.subcategory || ''));
        const localIndex = siblingDishes.findIndex(d => d.id === dishId);
        let swapPartner;
        if (direction === 'up' && localIndex > 0) swapPartner = siblingDishes[localIndex - 1]; 
        else if (direction === 'down' && localIndex < siblingDishes.length - 1) swapPartner = siblingDishes[localIndex + 1];
        
        if (swapPartner) {
            const originalIndexTarget = dishes.findIndex(d => d.id === targetDish.id);
            const originalIndexPartner = dishes.findIndex(d => d.id === swapPartner.id);
            if (originalIndexTarget > -1 && originalIndexPartner > -1) {
                [dishes[originalIndexTarget], dishes[originalIndexPartner]] = [dishes[originalIndexPartner], dishes[originalIndexTarget]];
                await saveData(); renderDatabasePanel(); setTimeout(() => triggerFlash(dishId), 50);
            }
        }
    }
    
    async function toggleDessertSelection(dishId){ 
        const dish=findDishById(dishId); if(!dish)return; 
        const index=selectedDishes.postre.findIndex(d=>d.id===dishId); 
        if(index>-1){ selectedDishes.postre.splice(index,1); } else { selectedDishes.postre.push(dish); showToast('Postre añadido', 'success'); } 
        await saveData(); renderAll(); 
    }
    
    async function clearSelectedDishes(){ if(confirm('¿Seguro que quieres vaciar el menú?')){ selectedDishes={primer:[],segundo:[],postre:[]}; await saveData(); renderAll(); showToast('Menú vaciado', 'info'); } }
    
    function openSubcategoryModal(){ renderSubcategoryModal(); $('subcategory-modal').style.display='flex'; }
    function closeSubcategoryModal(){ $('subcategory-modal').style.display='none'; }
    
    function renderSubcategoryModal() {
        const lists = { primer: $('primer-subcat-list'), segundo: $('segundo-subcat-list') };
        for (const category in lists) {
            const subcatList = subcategories[category] || [];
            lists[category].innerHTML = subcatList.map(name => `
                <div class="subcategory-item">
                    <span contenteditable="true" data-action="rename-subcategory-input" data-category="${category}" data-old-name="${name}">${name}</span>
                    <button class="action-icon" data-action="delete-subcategory" data-category="${category}" data-old-name="${name}" title="Eliminar">&times;</button>
                </div>`).join('');
        }
    }

    async function renameSubcategory(targetElement) {
        const { category, oldName } = targetElement.dataset;
        const newName = targetElement.textContent.trim();
        if (newName && newName !== oldName) {
            if ((subcategories[category] || []).includes(newName)) { showToast('Ya existe esa subcategoría', 'error'); targetElement.textContent = oldName; return; }
            if (!subcategories[category]) subcategories[category] = [];
            subcategories[category] = subcategories[category].map(sc => sc === oldName ? newName : sc);
            subcategories[category].sort();
            dishes.forEach(dish => { if (dish.category === category && dish.subcategory === oldName) dish.subcategory = newName; });
            await saveData(); await saveSettings(); renderDatabasePanel(); showToast('Renombrado correctamente', 'success');
        } else { targetElement.textContent = oldName; }
    }

    async function addSubcategory(category){ const input=$(`new-${category}-subcategory`); const newName=input.value.trim(); if(!subcategories[category])subcategories[category]=[]; if(newName&&!subcategories[category].includes(newName)){ subcategories[category].push(newName); subcategories[category].sort(); await saveSettings(); renderSubcategoryModal(); input.value=''; } }
    async function deleteSubcategory(category,name){ if(confirm(`¿Eliminar subcategoría "${name}"?`)){ if(subcategories[category]) subcategories[category]=subcategories[category].filter(sc=>sc!==name); dishes.forEach(dish=>{ if(dish.category===category&&dish.subcategory===name){ dish.subcategory=''; } }); await saveData(); await saveSettings(); renderSubcategoryModal(); renderDatabasePanel(); } }
    
    function printMenu(){const content=$('menuPreview').innerHTML;const printWindow=window.open('','_blank');const printCss=`body{font-family:Arial,sans-serif !important;margin:0;color:#000}.menu-header{text-align:center;border-bottom:1px solid #333;padding-bottom:10px;margin-bottom:20px}.menu-title{font-style:italic;font-weight:normal !important;font-size:${printSettings.titleSize}px !important;text-align:${printSettings.titleAlign} !important}.menu-header div:nth-of-type(2){font-style:italic;color:#333;margin-bottom:15px}.menu-date-price{display:flex;justify-content:space-between;font-weight:bold;font-size:1.1em}.menu-section{margin-bottom:${printSettings.sectionMargin}px !important;break-inside:avoid}.section-title{font-weight:bold;text-transform:uppercase;font-size:${printSettings.sectionTitleSize}px !important;text-align:${printSettings.sectionTitleAlign} !important;margin-bottom:8px;padding-bottom:0;border-bottom:none}.menu-item{margin-bottom:${printSettings.itemMargin}px !important}.menu-item-spanish{font-weight:normal;font-size:${printSettings.mainEs}px !important}.menu-item-catalan{font-style:italic;color:#333;font-size:${printSettings.mainCa}px !important}.menu-section[data-category="postre"] .menu-item-spanish{font-size:${printSettings.postreEs}px !important}.menu-section[data-category="postre"] .menu-item-catalan{font-size:${printSettings.postreCa}px !important}.menu-hours{text-align:center;margin-top:20px;padding-top:15px;border-top:none;font-weight:bold;font-size:1.1em}`;printWindow.document.write(`<!DOCTYPE html><html><head><title>Menú del día</title><meta charset="UTF-8"><style>@page{size:A4;margin:20mm} ${printCss}</style></head><body>${content}</body></html>`);printWindow.document.close();printWindow.focus();setTimeout(()=>{try{printWindow.print();printWindow.close()}catch(e){console.error("Print failed",e)}},500)}
    function updateSyncStatus(status,msg){$('syncStatus').className=`sync-status ${status}`;$('syncStatus').textContent=msg}
    function findDishById(id){let dish=dishes.find(d=>d.id===id);if(dish)return dish;for(const category in selectedDishes){dish=(selectedDishes[category]||[]).find(d=>d.id===id);if(dish)return dish}return null}
    function findDishInSource(id, source, sourceCategory) { if (source === 'menu') { return (selectedDishes[sourceCategory] || []).find(d => d.id === id); } return dishes.find(d => d.id === id); }
    function toggleCollapse(id){collapseState[id]=!collapseState[id];localStorage.setItem('collapseState',JSON.stringify(collapseState));const header=document.querySelector(`[data-collapse-id="${id}"]`);const content=document.querySelector(`[data-content-id="${id}"]`);if(header&&content){header.parentElement.classList.toggle('is-expanded');header.querySelector('.rotate-icon').classList.toggle('rotated');content.classList.toggle('expanded')}}
    function initPrintControls(){for(const key in printSettings){const inputId=`ps${key.charAt(0).toUpperCase()+key.slice(1)}`;const input=$(inputId);if(input){if(input.tagName==='SELECT'){input.value=printSettings[key]}else{input.value=printSettings[key]}}}}
    function setDateAndPrice(){const dateInput=$('menuDate');if(!dateInput.value)dateInput.valueAsDate=new Date();const selectedDate=new Date(dateInput.value);const day=selectedDate.getDay();const isWeekend=(day===0||day===6);const isHoliday=spanishHolidays.includes(dateInput.value);if(isWeekend||isHoliday){$('menuPrice').value='19.50 €';$('priceInfo').textContent=isHoliday?'Hoy es festivo':'Fin de semana'}else{$('menuPrice').value='14.50 €';$('priceInfo').textContent='Día laborable'}}
    function applyFontStylesToPreview(){let styleTag=$('previewFontStyle');if(!styleTag){styleTag=document.createElement('style');styleTag.id='previewFontStyle';document.head.appendChild(styleTag)}styleTag.textContent=`#menuPreview .menu-title{font-size:${printSettings.titleSize}px;text-align:${printSettings.titleAlign}}#menuPreview .section-title{font-size:${printSettings.sectionTitleSize}px;text-align:${printSettings.sectionTitleAlign}}#menuPreview .menu-section{margin-bottom:${printSettings.sectionMargin}px}#menuPreview .menu-item{margin-bottom:${printSettings.itemMargin}px}#menuPreview .menu-section[data-category="primer"] .menu-item-spanish,#menuPreview .menu-section[data-category="segundo"] .menu-item-spanish{font-size:${printSettings.mainEs}px}#menuPreview .menu-section[data-category="primer"] .menu-item-catalan,#menuPreview .menu-section[data-category="segundo"] .menu-item-catalan{font-size:${printSettings.mainCa}px}#menuPreview .menu-section[data-category="postre"] .menu-item-spanish{font-size:${printSettings.postreEs}px}#menuPreview .menu-section[data-category="postre"] .menu-item-catalan{font-size:${printSettings.postreCa}px}`}
    function setupDragAndDrop(){let draggedElementData=null;document.body.addEventListener('dragstart',e=>{const dishItem=e.target.closest('[data-dish-id]');if(!dishItem)return;e.target.classList.add('dragging');draggedElementData={dishId:parseInt(dishItem.dataset.dishId),sourceCategory:dishItem.dataset.category||findDishById(parseInt(dishItem.dataset.dishId))?.category,source:e.target.closest('#panel-database')?'database':'menu'};e.dataTransfer.effectAllowed='move'});document.body.addEventListener('dragend',e=>{const dragging=document.querySelector('.dragging');if(dragging)dragging.classList.remove('dragging');draggedElementData=null});document.body.addEventListener('dragenter',e=>{const dropZone=e.target.closest('[data-drop-target-category]');if(dropZone){dropZone.classList.add('drop-hover')}});document.body.addEventListener('dragleave',e=>{const dropZone=e.target.closest('[data-drop-target-category]');if(dropZone){dropZone.classList.remove('drop-hover')}});document.body.addEventListener('dragover',e=>{if(e.target.closest('.category-dishes,[data-drop-target-category]')){e.preventDefault()}});document.body.addEventListener('drop',async e=>{e.preventDefault();const hoverZone=document.querySelector('.drop-hover');if(hoverZone)hoverZone.classList.remove('drop-hover');if(!draggedElementData)return;const headerDropZone=e.target.closest('[data-drop-target-category]');if(headerDropZone){const dish=findDishById(draggedElementData.dishId);if(dish){dish.category=headerDropZone.dataset.dropTargetCategory;dish.subcategory=headerDropZone.dataset.dropTargetSubcategory||'';await saveData();renderDatabasePanel()}return}const menuDropZone=e.target.closest('.category-dishes');if(menuDropZone){const targetCategory=menuDropZone.dataset.dropZone;const{dishId,source,sourceCategory}=draggedElementData;let dish;if(source==='menu'){const list=selectedDishes[sourceCategory];const index=list.findIndex(d=>d.id===dishId);if(index>-1)dish=list.splice(index,1)[0]}else{const foundDish=findDishById(dishId);if(foundDish)dish={...foundDish}}if(dish){dish.category=targetCategory;if(!selectedDishes[targetCategory]||!selectedDishes[category].some(d=>d.id===dish.id)){if(!selectedDishes[targetCategory])selectedDishes[targetCategory]=[];selectedDishes[targetCategory].push(dish);await saveData();renderAll()}else{renderAll()}}}})}
    
    // HTML 模板
    function dishToDishItemHtml(dish) { const isSelected = activeSelection.type === 'db' && activeSelection.id === dish.id; return `<div class="dish-item ${isSelected ? 'is-selected' : ''}" draggable="true" data-dish-id="${dish.id}"><div class="dish-item-content"><h4>${dish.spanish}</h4><p><em>${dish.catalan}</em></p></div><div class="actions"><button class="action-icon" data-action="edit-db-dish" data-dish-id="${dish.id}" title="Editar"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/></svg></button><button class="action-icon" data-action="add-to-menu" data-dish-id="${dish.id}" title="Añadir al menú"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/></svg></button></div></div>`; }
    function dishToDessertChipHtml(dish) { const isSelected = selectedDishes.postre.some(d => d.id === dish.id); return `<div class="dessert-chip ${isSelected ? 'selected' : ''}" data-action="toggle-dessert" data-dish-id="${dish.id}"><span class="dessert-chip-name">${dish.spanish}</span><div class="actions"><button class="action-icon" data-action="edit-db-dish" data-dish-id="${dish.id}" title="Editar"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/></svg></button></div></div>`; }
    function dishToSelectedDishHtml(dish, category) { const isSelected = activeSelection.type === 'menu' && activeSelection.id === dish.id; return `<div class="selected-dish ${isSelected ? 'is-selected' : ''}" draggable="true" data-dish-id="${dish.id}" data-category="${category}"><span class="drag-handle">⋮⋮</span><div class="dish-content"><strong>${dish.spanish}</strong><br><em>${dish.catalan}</em></div><div class="dish-actions"><button class="action-icon" data-action="edit-menu-dish" data-dish-id="${dish.id}" data-category="${category}" title="Editar"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/></svg></button><button class="action-icon" data-action="remove-from-menu" data-dish-id="${dish.id}" data-category="${category}" title="Quitar"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L9.06 8l3.22 3.22a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06 0L3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg></button></div></div>`; }

    // ================== 启动 ==================
    // 词典常量
    const spanishHolidays=['2025-01-01','2025-01-06','2025-04-18','2025-04-21','2025-05-01','2025-08-15','2025-10-12','2025-11-01','2025-12-06','2025-12-08','2025-12-25'];

    initializeApp();
});