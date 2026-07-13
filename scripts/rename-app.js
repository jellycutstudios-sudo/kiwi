import fs from 'fs';
import path from 'path';

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        if (['node_modules', '.git', '.vite', 'dist', 'build'].includes(file)) return;
        file = path.resolve(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            results.push(file);
        }
    });
    return results;
}

const files = walk(process.cwd());

let updatedCount = 0;

files.forEach(f => {
    if (f.match(/\.(jsx|js|html|css|json|md|xml)$/)) {
        let content = fs.readFileSync(f, 'utf-8');
        if (content.includes('DineOS') || content.includes('dineOS') || content.includes('dineos')) {
            content = content.replaceAll('DineOS', 'DineOS');
            content = content.replaceAll('dineOS', 'dineOS');
            content = content.replaceAll('dineos', 'dineos');
            fs.writeFileSync(f, content, 'utf-8');
            console.log('Updated ' + f);
            updatedCount++;
        }
    }
});

console.log(`Successfully updated ${updatedCount} files.`);
