function Split-VerifiedModelBlob([string]$Source, [string]$Prefix, [long]$PartSize = 1500000000) {
    $inputFile = [IO.File]::OpenRead($Source)
    $buffer = New-Object byte[] (1024*1024)
    try {
        for ($index = 1; $inputFile.Position -lt $inputFile.Length; $index++) {
            $part = $Prefix + ('.{0:d2}' -f $index)
            $outputFile = [IO.File]::Open($part, 'CreateNew')
            try {
                $remaining = $PartSize
                while ($remaining -gt 0) {
                    $read = $inputFile.Read($buffer, 0, [int][Math]::Min($buffer.Length, $remaining))
                    if ($read -eq 0) { break }
                    $outputFile.Write($buffer, 0, $read)
                    $remaining -= $read
                }
            } finally { $outputFile.Dispose() }
            $part
        }
    } finally { $inputFile.Dispose() }
}

function Join-VerifiedModelBlob([string[]]$Parts, [string]$Destination, [string]$Sha256) {
    $pending = $Destination + '.' + [guid]::NewGuid().ToString('N') + '.pending'
    try {
        $outputFile = [IO.File]::Open($pending, 'CreateNew')
        try {
            foreach ($part in $Parts) {
                $inputFile = [IO.File]::OpenRead($part)
                try { $inputFile.CopyTo($outputFile) } finally { $inputFile.Dispose() }
            }
        } finally { $outputFile.Dispose() }
        if ((Get-FileHash -LiteralPath $pending).Hash -ne $Sha256) { throw 'Model SHA-256 mismatch.' }
        if (Test-Path -LiteralPath $Destination) {
            if ((Get-FileHash -LiteralPath $Destination).Hash -ne $Sha256) { throw 'An existing model blob differs. Move it aside before retrying.' }
        } else { [IO.File]::Move($pending, $Destination) }
    } finally { if (Test-Path -LiteralPath $pending) { Remove-Item -LiteralPath $pending } }
}
