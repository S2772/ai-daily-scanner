from __future__ import annotations

import re
from html.parser import HTMLParser
from typing import Any, List


def clean_extracted_text(text: str) -> str:
    # Normalize whitespace while preserving paragraph breaks.
    text = text or ""
    text = re.sub(r"[\t\f\r ]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Only collapse runs of spaces; keep newlines.
    text = re.sub(r" {2,}", " ", text)
    return text.strip()


class _RelaxedStripTagsParser(HTMLParser):
    """Extract text from HTML.

    Compared to the previous implementation, this parser is intentionally
    conservative about skipping. It only skips truly non-content tags
    (script/style/svg/iframe/etc.) and does NOT skip blocks based on UI-like
    class/id keywords. Many modern pages (WeChat included) place the actual
    article inside containers that include words like 'header', 'author', etc.
    """

    _SKIP_TAGS = {
        "script",
        "style",
        "noscript",
        "svg",
        "canvas",
        "iframe",
    }

    _BLOCK_TAGS = {
        "article",
        "section",
        "div",
        "p",
        "br",
        "li",
        "ul",
        "ol",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "blockquote",
    }

    def __init__(self):
        super().__init__()
        self._skip_stack: List[bool] = []
        self._parts: List[str] = []

    def handle_starttag(self, tag, attrs):
        tag_lower = (tag or "").lower()
        parent_skip = self._skip_stack[-1] if self._skip_stack else False
        skip = parent_skip or (tag_lower in self._SKIP_TAGS)
        self._skip_stack.append(skip)
        if not skip and tag_lower in self._BLOCK_TAGS:
            self._parts.append("\n")

    def handle_endtag(self, tag):
        tag_lower = (tag or "").lower()
        skipping = self._skip_stack.pop() if self._skip_stack else False
        if not skipping and tag_lower in self._BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data):
        if self._skip_stack and self._skip_stack[-1]:
            return
        text = (data or "")
        if text:
            self._parts.append(text)

    def get_text(self) -> str:
        text = "".join(self._parts)
        return clean_extracted_text(text)


def strip_html_tags_relaxed(html: str) -> str:
    if not html:
        return ""
    parser = _RelaxedStripTagsParser()
    try:
        parser.feed(html)
        text = parser.get_text()
    except Exception:
        text = clean_extracted_text(re.sub(r"<[^>]+>", " ", html))

    # WeChat / WeWe-RSS exports often include navigation chrome and fixed labels.
    # Keep the extractor generic but remove a few high-noise tokens.
    for token in [
        "在小说阅读器中沉浸阅读",
        "Original",
    ]:
        text = text.replace(token, " ")
    return clean_extracted_text(text)
