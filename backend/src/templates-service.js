const Handlebars = require('handlebars');

// Simple LRU cache for compiled Handlebars templates.
// Keyed by templateId. Invalidated when a template is updated/deleted.
const MAX_CACHE_SIZE = 50;
const compiledCache = new Map();

function getCompiled(id, source) {
  if (!compiledCache.has(id)) {
    if (compiledCache.size >= MAX_CACHE_SIZE) {
      // Evict the oldest entry
      compiledCache.delete(compiledCache.keys().next().value);
    }
    compiledCache.set(id, Handlebars.compile(source));
  }
  return compiledCache.get(id);
}

function invalidateTemplate(id) {
  compiledCache.delete(`${id}:subject`);
  compiledCache.delete(`${id}:html`);
  compiledCache.delete(`${id}:text`);
}

function renderTemplate(template, variables) {
  const id = template.id || '__no_id__';
  const subjectFn = getCompiled(`${id}:subject`, template.subject);
  const htmlFn    = getCompiled(`${id}:html`,    template.htmlBody);
  const plainFn   = getCompiled(`${id}:text`,    template.plainTextBody);

  return {
    subject: subjectFn(variables),
    html:    htmlFn(variables),
    text:    plainFn(variables),
  };
}

module.exports = { renderTemplate, invalidateTemplate };
