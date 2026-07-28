#!/bin/sh
set -e

# O container inicia como root só pra corrigir a posse do volume montado
# (plataformas como Railway montam /data por fora do build, geralmente
# como root, sobrepondo qualquer chown feito no Dockerfile). Depois disso,
# larga o privilégio antes de executar o processo real.
mkdir -p /data
chown -R kabemjunto:kabemjunto /data

exec su-exec kabemjunto "$@"
