import fs from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'public', 'Uno_No_Mercy_Cards');
const files = fs.readdirSync(dir);

const cards = [];

files.forEach(file => {
  if (file.endsWith('.png')) {
    // example: 001_Yellow_+2.png
    // 043_Blue_0.png
    // 029_Yellow_Reverse.png
    // 031_Yellow_Skip_Everyone.png
    // 034_Yellow_Discard_All.png
    // 145_Wild_+10.png
    // 149_Wild_Reverse_Draw_4.png
    // 157_Wild_Color_Roulette.png
    
    let color = 'wild';
    let value = '';
    const name = file.replace('.png', '').substring(4); // remove "001_"
    
    if (name.startsWith('Yellow_')) { color = 'yellow'; value = name.substring(7); }
    else if (name.startsWith('Blue_')) { color = 'blue'; value = name.substring(5); }
    else if (name.startsWith('Green_')) { color = 'green'; value = name.substring(6); }
    else if (name.startsWith('Red_')) { color = 'red'; value = name.substring(4); }
    else if (name.startsWith('Wild_')) { color = 'wild'; value = name.substring(5); }
    
    // Normalize values
    if (value === '+2') value = 'draw2';
    else if (value === '+4') value = 'wild-draw4';
    else if (value === '+6') value = 'draw6';
    else if (value === '+10') value = 'draw10';
    else if (value === 'Skip') value = 'skip';
    else if (value === 'Reverse') value = 'reverse';
    else if (value === 'Skip_Everyone') value = 'skip-everyone';
    else if (value === 'Discard_All') value = 'discard-all';
    else if (value === 'Reverse_Draw_4') value = 'wild-reverse-draw4';
    else if (value === 'Color_Roulette') value = 'color-roulette';
    
    cards.push({
      id: file.replace('.png', ''), // e.g. 001_Yellow_+2
      color,
      value
    });
  }
});

fs.writeFileSync(path.join(process.cwd(), 'src', 'deck.json'), JSON.stringify(cards, null, 2));
console.log(`Generated ${cards.length} cards.`);
