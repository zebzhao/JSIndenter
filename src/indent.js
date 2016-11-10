(function(exports) {
    exports.indent = {
        indentCSS: indentJS,
        indentJS: indentJS,
        indentHTML: indentHTML
    };

    var NEW_LINE_REGEX = /\r*\n/;
    var jsRules = [
        {
            name: "line comment",
            startToken: [/\/\//],
            endToken: [NEW_LINE_REGEX],
            ignore: true,
            indent: false
        },
        {
            name: "block comment",
            startToken: [/\/\*/],
            endToken: [/\*\//],
            ignore: true,
            indent: false
        },
        {
            name: "regex",
            startToken: [function(string, rule) {
                var re = /[(,=:[!&|?{};][\s]*\/[^/]|^[\s]*\/[^/]/;
                var startIndex = string.search(re);
                if (startIndex != -1) {
                    startIndex = string.indexOf('/', startIndex);
                    var substr = string.substring(startIndex);
                    var match = searchAny(substr, rule.endToken, rule);
                    if (match.matchIndex != -1) {
                        substr = substr.substring(0, match.matchIndex);
                        try {
                            (new RegExp(substr));
                            return {
                                matchIndex: startIndex,
                                length: 1
                            };
                        }
                        catch(e) {
                            return {matchIndex: -1};
                        }
                    }
                }
                return {matchIndex: -1};
            }],
            endToken: [function(string, rule) {
                var fromIndex = 0;
                var index = string.indexOf('/');
                while (index != -1) {
                    try {
                        (new RegExp(string.substring(0, index)));
                        break;
                    }
                    catch (e) {
                        index = string.indexOf('/', fromIndex);
                        fromIndex = index+1;
                    }
                }
                return {
                    matchIndex: index,
                    length: index == -1 ? 0 : 1
                };
            }],
            ignore: true,
            indent: false,
            advance: true
        },
        {
            name: "string",
            startToken: [/\"/],
            endToken: [/\"/, NEW_LINE_REGEX],
            ignore: true,
            indent: false,
            advance: true
        },
        {
            name: "string",
            startToken: [/\'/],
            endToken: [/\'/, NEW_LINE_REGEX],
            ignore: true,
            indent: false,
            advance: true
        },
        {
            name: "string",
            startToken: [/\`/],
            endToken: [/\`/],
            ignore: true,
            indent: false,
            advance: true
        },
        {
            name: "if",
            startToken: [/^if[\s]*(?=\()/, /[\s]+if[\s]*(?=\()/],
            endToken: [/else[\s]+/, /\{/, /\;/, NEW_LINE_REGEX],
            indent: true
        },
        {
            name: "for",
            startToken: [/^for[\s]*(?=\()/],
            endToken: [/\{/, /\;/, NEW_LINE_REGEX],
            indent: true
        },
        {
            name: "else",
            startToken: [/else[\s]+/],
            endToken: [/if/, /\{/, /\;/, NEW_LINE_REGEX],
            indent: true
        },
        {
            name: "bracket",
            startToken: [/\(/],
            endToken: [/\)/],
            indent: true,
            advance: true
        },
        {
            name: "array",
            startToken: [/\[/],
            endToken: [/\]/],
            indent: true,
            advance: true
        },
        {
            name: "block",
            startToken: [/\{/],
            endToken: [/\}/],
            indent: true,
            advance: true
        },
        {
            name: "var",
            startToken: [/var[\s]+/],
            endToken: [/\;/],
            indent: true
        },
        {
            name: "case",
            startToken: [/^case[\s]+/],
            endToken: [/break[\s;]+/, /^case[\s]+/, /^default[\s]+/, /\}/],
            indent: true
        }
    ];

    var htmlRules = [
        {
            name: "comment",
            startToken: [/\<\!\-\-/],
            endToken: [/\-\-\>/],
            ignore: true,
            indent: false,
            advance: true
        },
        {
            name: "doctype",
            startToken: [/\<\!/],
            endToken: [NEW_LINE_REGEX],
            ignore: true,
            indent: false,
            advance: true
        },
        {
            name: "tag",
            startToken: [/<(\"[^\"]*\"|'[^']*'|[^'\">])*>/],
            endToken: [/\<\/[^\>]+\>/],
            indent: true,
            advance: true
        },
        {
            name: "tag",
            startToken: [/<(\"[^\"]*\"|'[^']*'|[^'\">])*/],
            endToken: [/\/\>/],
            indent: false,
            advance: true
        }
    ].concat(jsRules);

    function indentJS(code, indentString) {
        return indent(code, jsRules, indentString);
    }

    function indentHTML(code, indentString) {
        return indent(code, htmlRules, indentString);
    }

    function indent(code, rules, indentation) {
        var lines = code.split(/[\r]?\n/gi);
        var lineCount = lines.length;
        var newLines = [];
        var indentBuffer = [];
        var activeRules = [];
        var lastRule;
        var indents = 0;
        var l = 0;
        var pos = 0;
        var matchEnd, matchStart;

        while (l < lineCount) {
            var line = lines[l].trim()+'\r\n';
            var lineToMatch = cleanEscapedChars(line);

            matchStart = matchStartRule(lineToMatch, rules, pos);

            if (activeRules.length) {
                matchEnd = matchEndRule(lineToMatch, lastRule, pos);
                if (matchEnd.matchIndex == -1) {
                    if (lastRule.ignore) {
                        // last rule is still active, and it's telling us to ignore.
                        incrementLine();
                        continue;
                    }
                }
                else if (lastRule.ignore || matchStart.matchIndex == -1 || matchEnd.matchIndex <= matchStart.matchIndex) {
                    if (lastRule.indent) {
                        consumeIndentation();
                        if (matchEnd.matchIndex == 0) {
                            calculateIndents();
                        }
                    }
                    pos = matchEnd.cursor;
                    removeLastRule();
                    continue;  // Repeat process for matching line start/end
                }
            }

            if (matchStart.matchIndex != -1) {
                implementRule(matchStart);
            }
            else {
                // No new token match end, no new match start
                incrementLine();
            }
        }

        return newLines.join("");

        function implementRule(match) {
            pos = match.cursor;
            lastRule = match.rule;
            activeRules.push(lastRule);
            if (lastRule.indent)
                incrementIndentation();
        }

        function removeLastRule() {
            activeRules.pop();
            lastRule = activeRules[activeRules.length-1];
        }

        function calculateIndents() {
            indents = 0;
            for (var b,i=0; i<indentBuffer.length; i++) {
                b = indentBuffer[i];
                if (b.open && b.line != l)
                    indents++;
            }
        }

        function incrementLine() {
            newLines[l] = repeatString(indentation, indents) + line;
            l++;
            pos = 0;
            calculateIndents();
        }

        function incrementIndentation() {
            var matched = indentBuffer[indentBuffer.length-1];
            if (matched && matched.line == l) {
                matched.indent++;
            }
            else {
                indentBuffer.push({
                    indent: 1,
                    open: true,
                    line: l
                });
            }
        }

        function consumeIndentation() {
            var lastElem = indentBuffer[indentBuffer.length-1];
            if (lastElem) {
                lastElem.open = l == lastElem.line;
                if (--lastElem.indent <= 0) {
                    indentBuffer.pop();
                }
            }
        }
    }
 
    function repeatString(baseString, repeat) {
        return (new Array(repeat+1)).join(baseString);
    }

    function cleanEscapedChars(string) {
        return string.replace(/\\(u[0-9A-Za-z]{4}|u\{[0-9A-Za-z]{1,6}]\}|x[0-9A-Za-z]{2}|.)/g, '0');
    }

    function matchStartRule(string, rules, index) {
        string = string.substring(index, string.length);
        var result = null;
        var minIndex = string.length;
        var minMatch;
        var match;
        for (var rule,r=0; r<rules.length; r++) {
            rule = rules[r];
            match = searchAny(string, rule.startToken, rule);
            if (match.matchIndex != -1 && match.matchIndex < minIndex) {
                minIndex = match.matchIndex;
                minMatch = match;
                result = rule;
            }
        }
        return {
            rule: result,
            matchIndex: result ? minIndex + index : -1,
            cursor: result ? minIndex + index + minMatch.matchLength : -1
        };
    }

    function matchEndRule(string, rule, offset) {
        string = string.substr(offset, string.length);
        var match = searchAny(string, rule.endToken, rule);
        var cursor = rule.advance ? match.matchIndex + match.matchLength : match.matchIndex;
        return {
            matchIndex: match.matchIndex == -1 ? -1 : match.matchIndex + offset,
            cursor: cursor == -1 ? -1 : cursor + offset
        };
    }

    function searchAny(string, patterns, rule) {
        var index = -1;
        var length = 0;
        for (var pat,p=0; p<patterns.length; p++) {
            pat = patterns[p];
            if (typeof pat == 'function') {
                var match = pat(string, rule);
                index = match.matchIndex;
                length = match.length;
            }
            else {
                index = string.search(pat);
                if (index != -1) {
                    length = string.match(pat)[0].length;
                    break;
                }
            }
        }
        return {
            matchIndex: index,
            matchLength: length,
            cursor: index + length,
            patternIndex: p
        };
    }
})(this);