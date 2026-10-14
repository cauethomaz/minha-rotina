#!/bin/bash
# Instala o que a fila de edição automática precisa no Mac (rodar uma vez, no Terminal):
#   bash ~/Documents/minha-rotina/scripts/instalar-edicao.sh
# Pede a senha do Mac só se o Homebrew ainda não estiver instalado.
set -e
BASE="$HOME/.claude/edicao"
mkdir -p "$BASE/modelos" "$BASE/fontes"

echo "1/5 Homebrew"
if ! command -v brew >/dev/null 2>&1; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
  grep -q 'brew shellenv' "$HOME/.zprofile" 2>/dev/null || echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
fi

echo "2/5 ffmpeg e whisper.cpp"
brew install ffmpeg whisper-cpp

echo "3/5 Modelo de transcrição (large-v3-turbo, ~550 MB)"
M="$BASE/modelos/ggml-large-v3-turbo-q5_0.bin"
[ -s "$M" ] || curl -L --fail -o "$M" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin"

echo "4/5 Fonte Montserrat ExtraBold (legendas)"
F="$BASE/fontes/Montserrat-ExtraBold.ttf"
[ -s "$F" ] || curl -L --fail -o "$F" "https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-ExtraBold.ttf"
mkdir -p "$HOME/Library/Fonts" && cp -f "$F" "$HOME/Library/Fonts/"

echo "5/5 Python (numpy para achar os pontos de corte)"
[ -x "$BASE/venv/bin/python" ] || python3 -m venv "$BASE/venv"
"$BASE/venv/bin/pip" install -q --upgrade pip numpy

echo
ffmpeg -hide_banner -filters 2>/dev/null | grep -q " ass " && echo "ffmpeg com legendas (libass): ok" || echo "ATENÇÃO: ffmpeg sem libass"
command -v whisper-cli >/dev/null && echo "whisper-cli: ok"
echo "INSTALACAO_OK — pode avisar o Claude."
