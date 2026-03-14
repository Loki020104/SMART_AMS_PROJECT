import sys

with open('frontend/app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = None
end_idx = None

# Find the line with "card-header" and "Face Registration" that comes right after a lone "}"
for i, line in enumerate(lines):
    if 'card-title' in line and 'Face Registration' in line and 'card-header' in line:
        if i > 0 and lines[i-1].strip() == '}':
            start_idx = i
            print(f"Orphaned block start at line {i+1}: {repr(line[:80])}")
            break

if start_idx is None:
    # Try printing all occurrences of "Face Registration" lines
    print("Could not find start. Showing all 'Face Registration' lines:")
    for i, line in enumerate(lines):
        if 'Face Registration' in line and 'card' in line:
            print(f"  Line {i+1}: prev={repr(lines[i-1].strip()[:40])} | {repr(line[:80])}")
    sys.exit(1)

for i in range(start_idx, len(lines)):
    if 'function initFaceRegistration(){' in lines[i]:
        end_idx = i
        print(f"End anchor (initFaceRegistration) at line {i+1}")
        break

if end_idx is None:
    print("ERROR: Could not find end anchor")
    sys.exit(1)

print(f"Will delete lines {start_idx+1} through {end_idx} ({end_idx - start_idx} lines)")

# Keep one blank line separator before the function
new_lines = lines[:start_idx] + lines[end_idx-1:]

with open('frontend/app.js', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Done! Removed orphaned block.")
