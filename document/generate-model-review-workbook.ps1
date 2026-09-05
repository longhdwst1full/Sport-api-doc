$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$documentDir = if ($PSScriptRoot) { $PSScriptRoot } else { Join-Path (Get-Location) 'document' }
$dbmlPath = Join-Path $documentDir '09-v1-model.dbml'
$catalogPath = Join-Path $documentDir '04-table-catalog.csv'
$decisionsPath = Join-Path $documentDir '08-open-decisions.csv'
$rbacPath = Join-Path $documentDir '05-rbac-permissions.csv'
$outputPath = Join-Path $documentDir 'DCTD-UTC-V1-database-model-review.xlsx'

function Escape-Xml([object]$value) {
    if ($null -eq $value) { return '' }
    return [System.Security.SecurityElement]::Escape([string]$value)
}

function Get-ColumnName([int]$number) {
    $name = ''
    while ($number -gt 0) {
        $number--
        $name = [char](65 + ($number % 26)) + $name
        $number = [math]::Floor($number / 26)
    }
    return $name
}

function New-SheetXml([object[][]]$rows, [int[]]$widths, [int]$priorityColumn = 0, [int]$statusColumn = 0) {
    $builder = [System.Text.StringBuilder]::new()
    [void]$builder.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
    [void]$builder.Append('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">')
    [void]$builder.Append('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>')
    [void]$builder.Append('<cols>')
    for ($i = 0; $i -lt $widths.Count; $i++) {
        $column = $i + 1
        [void]$builder.Append("<col min=`"$column`" max=`"$column`" width=`"$($widths[$i])`" customWidth=`"1`"/>")
    }
    [void]$builder.Append('</cols><sheetData>')

    for ($rowIndex = 0; $rowIndex -lt $rows.Count; $rowIndex++) {
        $excelRow = $rowIndex + 1
        [void]$builder.Append("<row r=`"$excelRow`">")
        $row = $rows[$rowIndex]
        for ($columnIndex = 0; $columnIndex -lt $row.Count; $columnIndex++) {
            $cellRef = "$(Get-ColumnName ($columnIndex + 1))$excelRow"
            $style = if ($rowIndex -eq 0) { 1 } else { 2 }
            if ($rowIndex -gt 0 -and $priorityColumn -gt 0 -and ($columnIndex + 1) -eq $priorityColumn) {
                if ([string]$row[$columnIndex] -eq 'P0') { $style = 3 }
                elseif ([string]$row[$columnIndex] -eq 'P1') { $style = 4 }
            }
            if ($rowIndex -gt 0 -and $statusColumn -gt 0 -and ($columnIndex + 1) -eq $statusColumn) {
                if ([string]$row[$columnIndex] -eq 'DECIDED') { $style = 3 }
                elseif ([string]$row[$columnIndex] -eq 'PROPOSED') { $style = 5 }
            }
            $value = Escape-Xml $row[$columnIndex]
            [void]$builder.Append("<c r=`"$cellRef`" s=`"$style`" t=`"inlineStr`"><is><t xml:space=`"preserve`">$value</t></is></c>")
        }
        [void]$builder.Append('</row>')
    }

    $lastColumn = Get-ColumnName $rows[0].Count
    $lastRow = $rows.Count
    [void]$builder.Append("</sheetData><autoFilter ref=`"A1:$lastColumn$lastRow`"/>")
    [void]$builder.Append("<sheetFormatPr defaultRowHeight=`"15`"/><pageMargins left=`"0.25`" right=`"0.25`" top=`"0.5`" bottom=`"0.5`" header=`"0.2`" footer=`"0.2`"/></worksheet>")
    return $builder.ToString()
}

function Add-ZipEntry($archive, [string]$entryName, [string]$content) {
    $entry = $archive.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
    $stream = $entry.Open()
    $writer = [System.IO.StreamWriter]::new($stream, [System.Text.UTF8Encoding]::new($false))
    $writer.Write($content)
    $writer.Dispose()
}

$catalog = Import-Csv -Encoding UTF8 $catalogPath
$decisions = Import-Csv -Encoding UTF8 $decisionsPath
$permissions = Import-Csv -Encoding UTF8 $rbacPath
$dbml = Get-Content -Raw -Encoding UTF8 $dbmlPath

$columns = [System.Collections.Generic.List[object]]::new()
$tables = [regex]::Matches($dbml, '(?ms)^Table\s+([a-z0-9_]+)\s*\{(.*?)^\}')
foreach ($tableMatch in $tables) {
    $tableName = $tableMatch.Groups[1].Value
    $body = $tableMatch.Groups[2].Value
    $columnOrder = 0
    foreach ($line in ($body -split "`r?`n")) {
        if ($line -notmatch '^\s{2}([a-z][a-z0-9_]*)\s+([^\[]+?)(?:\s+\[(.*)\])?\s*$') { continue }
        $columnOrder++
        $columnName = $Matches[1]
        if ($columnName -eq 'indexes') { $columnOrder--; continue }
        $dataType = $Matches[2].Trim()
        $options = $Matches[3]
        $note = ''
        if ($options -match "note:\s*'([^']*)'") { $note = $Matches[1] }
        $default = ''
        if ($options -match "default:\s*('[^']*'|[^,\]]+)") { $default = $Matches[1].Trim("'") }
        $columns.Add([pscustomobject]@{
            table_name = $tableName
            column_order = $columnOrder
            column_name = $columnName
            data_type = $dataType
            nullable = if ($options -match 'not null') { 'NO' } else { 'YES' }
            primary_key = if ($options -match '(^|,\s*)pk(,|$)') { 'YES' } else { '' }
            unique = if ($options -match '(^|,\s*)unique(,|$)') { 'YES' } else { '' }
            default_value = $default
            note = $note
        })
    }
}

$relationships = [System.Collections.Generic.List[object]]::new()
foreach ($ref in [regex]::Matches($dbml, '(?m)^Ref:\s+([a-z0-9_]+)\.([a-z0-9_]+)\s+>\s+([a-z0-9_]+)\.([a-z0-9_]+)\s+\[delete:\s+([^\]]+)\]')) {
    $relationships.Add([pscustomobject]@{
        child_table = $ref.Groups[1].Value
        child_column = $ref.Groups[2].Value
        parent_table = $ref.Groups[3].Value
        parent_column = $ref.Groups[4].Value
        cardinality = 'N → 1'
        on_delete = $ref.Groups[5].Value.ToUpperInvariant()
    })
}

$p0Count = ($catalog | Where-Object priority -eq 'P0').Count
$p1Count = ($catalog | Where-Object priority -eq 'P1').Count
$proposedCount = ($decisions | Where-Object status -eq 'PROPOSED').Count
$decidedCount = ($decisions | Where-Object status -eq 'DECIDED').Count

$overviewRows = [System.Collections.Generic.List[object[]]]::new()
$overviewRows.Add(@('Hạng mục', 'Giá trị', 'Ý nghĩa / hướng dẫn review'))
$overviewRows.Add(@('Tên model', 'DCTD-UTC V1', 'Blueprint logic; chưa phải migration cuối cùng'))
$overviewRows.Add(@('Tổng số bảng', [string]$catalog.Count, 'Đối chiếu giữa DBML và table catalog'))
$overviewRows.Add(@('Bảng P0', [string]$p0Count, 'Core cần cho go-live'))
$overviewRows.Add(@('Bảng P1', [string]$p1Count, 'Mở rộng V1, triển khai sau core'))
$overviewRows.Add(@('Tổng số cột', [string]$columns.Count, 'Cột được phân tích từ DBML'))
$overviewRows.Add(@('Quan hệ FK', [string]$relationships.Count, 'Các khai báo Ref trong DBML'))
$overviewRows.Add(@('Decision đã chốt', [string]$decidedCount, 'Có thể dùng làm đầu vào migration'))
$overviewRows.Add(@('Decision còn mở', [string]$proposedCount, 'Cần chủ dự án xác nhận theo blocking wave'))
$overviewRows.Add(@('Nguồn bảng', '04-table-catalog.csv', 'Tên, module, priority, purpose, constraint và retention'))
$overviewRows.Add(@('Nguồn cột/FK', '09-v1-model.dbml', 'Cấu trúc vật lý và quan hệ'))
$overviewRows.Add(@('Cách dùng', 'Lọc theo module/priority', 'Bắt đầu từ Review Checklist, sau đó review Tables và Columns'))

$tableRows = [System.Collections.Generic.List[object[]]]::new()
$tableRows.Add(@('ID','Module','Tên bảng','Priority','Ý nghĩa','Khóa chính','Khóa ngoại quan trọng','Unique / CHECK','Các cột chính','Retention'))
foreach ($item in $catalog) {
    $tableRows.Add(@($item.id,$item.module,$item.table_name,$item.priority,$item.purpose,$item.primary_key,$item.important_foreign_keys,$item.unique_or_check,$item.key_columns,$item.retention))
}

$columnRows = [System.Collections.Generic.List[object[]]]::new()
$columnRows.Add(@('Tên bảng','STT','Tên cột','Kiểu dữ liệu','Cho phép NULL','Primary key','Unique','Default','Ý nghĩa / trạng thái cho phép'))
foreach ($item in $columns) {
    $columnRows.Add(@($item.table_name,[string]$item.column_order,$item.column_name,$item.data_type,$item.nullable,$item.primary_key,$item.unique,$item.default_value,$item.note))
}

$relationshipRows = [System.Collections.Generic.List[object[]]]::new()
$relationshipRows.Add(@('Bảng con','Cột FK','Bảng cha','Cột PK','Cardinality','ON DELETE','Điểm cần kiểm tra'))
foreach ($item in $relationships) {
    $review = if ($item.on_delete -eq 'CASCADE') { 'Xác nhận chỉ cascade dữ liệu con/master junction; không dùng cho transaction/ledger' } elseif ($item.on_delete -eq 'SET NULL') { 'Xác nhận dữ liệu vẫn hiểu được khi parent bị ẩn/xóa' } else { 'RESTRICT phù hợp dữ liệu giao dịch' }
    $relationshipRows.Add(@($item.child_table,$item.child_column,$item.parent_table,$item.parent_column,$item.cardinality,$item.on_delete,$review))
}

$reviewRows = [System.Collections.Generic.List[object[]]]::new()
$reviewRows.Add(@('Mức độ','Nhóm / bảng','Nội dung cần đánh giá','Khuyến nghị','Trạng thái review','Owner','Ghi chú'))
$reviewRows.Add(@('CRITICAL','inventory_balances / movements / reservations','Chứng minh available = on_hand - reserved >= 0 trong mọi luồng concurrent','Conditional update + row lock + reconciliation test','','Tech + Ops',''))
$reviewRows.Add(@('CRITICAL','orders','branch_id và warehouse_id phải thuộc cùng một cặp','Composite FK hoặc validation/trigger bắt buộc','','Tech + Ops',''))
$reviewRows.Add(@('CRITICAL','orders / payments / fulfillments','Ba state machine và các status projection không được lệch nhau','Chỉ transition bằng command trong cùng transaction','','Tech + Finance + Ops',''))
$reviewRows.Add(@('CRITICAL','order_items / order_item_components','Snapshot combo và quantity component phải bất biến','CHECK item_type và snapshot component; test return nguyên combo','','Product + Tech',''))
$reviewRows.Add(@('HIGH','approval_requests / stock_adjustments','Approval đang P1 nhưng adjustment P0 có threshold approval','Đưa approval tối thiểu vào P0 hoặc tắt threshold ở release đầu','','Business + Tech',''))
$reviewRows.Add(@('HIGH','inventory_reservations','Các FK order_item/component nullable có thể tạo reservation mơ hồ','CHECK đúng một nguồn standard item hoặc combo component','','Tech',''))
$reviewRows.Add(@('HIGH','product_prices','Khoảng giá active không được chồng nhau','PostgreSQL exclusion constraint trên effective range','','Business + Tech',''))
$reviewRows.Add(@('HIGH','shipping_rates','Các rule cùng dimension không được overlap','Exclusion constraint hoặc serialize command','','Business + Tech',''))
$reviewRows.Add(@('HIGH','refunds','Tổng refund thành công không vượt received_amount','Lock payment và tổng hợp refund trong transaction','','Finance + Tech',''))
$reviewRows.Add(@('HIGH','user_role_assignments','GLOBAL/BRANCH/WAREHOUSE/OWN phải có đúng scope FK','Database CHECK + deny-by-default integration test','','Security',''))
$reviewRows.Add(@('HIGH','media_assets / media_usages','Không xóa asset khi còn bất kỳ reference nào','Cleanup kiểm tra FK trực tiếp và polymorphic usage','','Tech + Content',''))
$reviewRows.Add(@('MEDIUM','product_bundles / bundle_items','Không nested bundle và không tự tham chiếu','Service validation trong transaction','','Product + Tech',''))
$reviewRows.Add(@('MEDIUM','categories / content_categories','Không tạo cycle khi đổi parent','Recursive validation + test concurrency','','Content + Tech',''))
$reviewRows.Add(@('MEDIUM','retention / PII','Chốt retention 10 năm và quy tắc anonymize','Legal/Finance phê duyệt trước production','','Legal + Finance',''))

$decisionRows = [System.Collections.Generic.List[object[]]]::new()
$decisionRows.Add(@('ID','Chủ đề','Quyết định đề xuất','Tại sao quan trọng','Owner','Blocking wave','Status','Kết luận review / ghi chú'))
foreach ($item in $decisions) {
    $decisionRows.Add(@($item.id,$item.topic,$item.proposed_decision,$item.why_it_matters,$item.owner,$item.blocking_wave,$item.status,''))
}

$permissionRows = [System.Collections.Generic.List[object[]]]::new()
$permissionRows.Add(@('Permission code','Module','Action','Allowed scopes','Sensitive','Default roles','Ghi chú'))
foreach ($item in $permissions) {
    $permissionRows.Add(@($item.permission_code,$item.module,$item.action,$item.allowed_scopes,$item.sensitive,$item.default_roles,$item.notes))
}

$sheets = @(
    @{ Name='Overview'; Rows=$overviewRows.ToArray(); Widths=@(24,28,75); Priority=0; Status=0 },
    @{ Name='Tables'; Rows=$tableRows.ToArray(); Widths=@(10,18,30,10,48,22,55,55,70,28); Priority=4; Status=0 },
    @{ Name='Columns'; Rows=$columnRows.ToArray(); Widths=@(30,8,32,24,14,14,12,20,60); Priority=0; Status=0 },
    @{ Name='Relationships'; Rows=$relationshipRows.ToArray(); Widths=@(30,32,30,22,14,14,70); Priority=0; Status=0 },
    @{ Name='Review Checklist'; Rows=$reviewRows.ToArray(); Widths=@(14,42,65,70,20,24,48); Priority=0; Status=0 },
    @{ Name='Open Decisions'; Rows=$decisionRows.ToArray(); Widths=@(10,28,70,55,24,14,14,60); Priority=0; Status=7 },
    @{ Name='RBAC Permissions'; Rows=$permissionRows.ToArray(); Widths=@(38,20,18,35,14,55,65); Priority=0; Status=0 }
)

$contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
for ($i = 1; $i -le $sheets.Count; $i++) { $contentTypes += "<Override PartName=`"/xl/worksheets/sheet$i.xml`" ContentType=`"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml`"/>" }
$contentTypes += '</Types>'

$rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
$workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
$workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
for ($i = 1; $i -le $sheets.Count; $i++) {
    $sheetName = Escape-Xml $sheets[$i - 1].Name
    $workbook += "<sheet name=`"$sheetName`" sheetId=`"$i`" r:id=`"rId$i`"/>"
    $workbookRels += "<Relationship Id=`"rId$i`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet`" Target=`"worksheets/sheet$i.xml`"/>"
}
$styleRelId = $sheets.Count + 1
$workbook += '</sheets></workbook>'
$workbookRels += "<Relationship Id=`"rId$styleRelId`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles`" Target=`"styles.xml`"/></Relationships>"

$styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Aptos"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC6EFCE"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFEB9C"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4CCCC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFD9E1F2"/></left><right style="thin"><color rgb="FFD9E1F2"/></right><top style="thin"><color rgb="FFD9E1F2"/></top><bottom style="thin"><color rgb="FFD9E1F2"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath -Force }
$fileStream = [System.IO.File]::Open($outputPath, [System.IO.FileMode]::CreateNew)
$archive = [System.IO.Compression.ZipArchive]::new($fileStream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    Add-ZipEntry $archive '[Content_Types].xml' $contentTypes
    Add-ZipEntry $archive '_rels/.rels' $rootRels
    Add-ZipEntry $archive 'xl/workbook.xml' $workbook
    Add-ZipEntry $archive 'xl/_rels/workbook.xml.rels' $workbookRels
    Add-ZipEntry $archive 'xl/styles.xml' $styles
    for ($i = 1; $i -le $sheets.Count; $i++) {
        $sheet = $sheets[$i - 1]
        $xml = New-SheetXml $sheet.Rows $sheet.Widths $sheet.Priority $sheet.Status
        Add-ZipEntry $archive "xl/worksheets/sheet$i.xml" $xml
    }
}
finally {
    $archive.Dispose()
    $fileStream.Dispose()
}

Write-Output $outputPath
Write-Output "Tables=$($catalog.Count); Columns=$($columns.Count); Relationships=$($relationships.Count); Decisions=$($decisions.Count); Permissions=$($permissions.Count)"
