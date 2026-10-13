use crate::printing::Box2;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Glyph {
    pub ch: char,
    pub bounds: Box2,
    pub origin: [f32; 2],
    pub size: f32,
    pub argb: u32,
    pub font: String,
    pub line: usize,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PageText {
    pub glyphs: Vec<Glyph>,
}
impl PageText {
    pub fn hit(&self, x: f32, y: f32) -> Option<usize> {
        // Restrict to the closest baseline before choosing a character: a line
        // break never accidentally selects the following block or whole page.
        self.glyphs
            .iter()
            .enumerate()
            .min_by(|(_, a), (_, b)| distance(a, x, y).total_cmp(&distance(b, x, y)))
            .map(|(i, _)| i)
    }
    pub fn word(&self, index: usize) -> (usize, usize) {
        if self.glyphs.is_empty() {
            return (0, 0);
        }
        let index = index.min(self.glyphs.len() - 1);
        let line = self.glyphs[index].line;
        let category = |c: char| {
            if c.is_whitespace() {
                0
            } else if c.is_alphanumeric() || c == '\'' {
                1
            } else {
                2
            }
        };
        let k = category(self.glyphs[index].ch);
        let mut a = index;
        let mut b = index;
        while a > 0 && self.glyphs[a - 1].line == line && category(self.glyphs[a - 1].ch) == k {
            a -= 1;
        }
        while b + 1 < self.glyphs.len()
            && self.glyphs[b + 1].line == line
            && category(self.glyphs[b + 1].ch) == k
        {
            b += 1;
        }
        (a, b)
    }
    pub fn line_range(&self, index: usize) -> (usize, usize) {
        let line = self.glyphs[index].line;
        let a = self
            .glyphs
            .iter()
            .position(|g| g.line == line)
            .unwrap_or(index);
        let b = self
            .glyphs
            .iter()
            .rposition(|g| g.line == line)
            .unwrap_or(index);
        (a, b)
    }
    pub fn selected_text(&self, a: usize, b: usize) -> String {
        let mut out = String::new();
        let mut line = None;
        for g in self.glyphs.iter().skip(a.min(b)).take(a.abs_diff(b) + 1) {
            if line.is_some() && line != Some(g.line) {
                out.push('\n');
            }
            out.push(g.ch);
            line = Some(g.line);
        }
        out
    }
}
fn distance(g: &Glyph, x: f32, y: f32) -> f32 {
    let b = g.bounds;
    let dx = (b.x - x).max(0.).max(x - b.x - b.w);
    let dy = (b.y - y).max(0.).max(y - b.y - b.h);
    dy * dy * 16. + dx * dx
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn drag_ten_lines_preserves_exact_endpoints() {
        let glyphs = (0..100)
            .map(|i| Glyph {
                ch: char::from(b'a' + (i % 10) as u8),
                line: i / 10,
                bounds: Box2 {
                    x: (i % 10) as f32 * 8.,
                    y: (i / 10) as f32 * 20.,
                    w: 8.,
                    h: 14.,
                },
                origin: [0., 0.],
                size: 12.,
                argb: 0xff000000,
                font: "Helvetica".into(),
            })
            .collect();
        let t = PageText { glyphs };
        assert_eq!(t.hit(4., 5.), Some(0));
        assert_eq!(t.hit(76., 185.), Some(99));
        assert_eq!(t.selected_text(0, 19).lines().count(), 2);
        assert_eq!(t.selected_text(40, 59).lines().count(), 2);
        assert_eq!(t.selected_text(99, 0).lines().count(), 10);
    }
    #[test]
    fn word_selection_does_not_cross_lines() {
        let t = PageText {
            glyphs: "word word"
                .chars()
                .enumerate()
                .map(|(i, ch)| Glyph {
                    ch,
                    line: if i < 4 { 0 } else { 1 },
                    bounds: Box2 {
                        x: 0.,
                        y: 0.,
                        w: 1.,
                        h: 1.,
                    },
                    origin: [0., 0.],
                    size: 12.,
                    argb: 0,
                    font: "Helvetica".into(),
                })
                .collect(),
        };
        assert_eq!(t.word(2), (0, 3));
        assert_eq!(t.word(6), (5, 8));
    }
}
