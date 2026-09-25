content = open('js/delegue.js', 'r', encoding='utf-8').read()

# Find and remove second getRoute (keep only the first)
first_pos = content.find("function getRoute(lat, lng) {")
if first_pos >= 0:
    second_pos = content.find("function getRoute(lat, lng) {", first_pos + 1)
    if second_pos >= 0:
        # Find the end of the second getRoute function
        end_pos = content.find("}", second_pos)
        # Find the next newline after the closing brace
        end_pos = content.find("\n", end_pos)
        # Also skip any blank lines after it
        while end_pos < len(content) - 1 and content[end_pos + 1] in ('\r', '\n', ' '):
            end_pos += 1
        # Remove the duplicate
        content = content[:second_pos] + content[end_pos + 1:]
        print("Removed duplicate getRoute")
    else:
        print("No duplicate found")
else:
    print("No getRoute found at all")

open('js/delegue.js', 'w', encoding='utf-8').write(content)
