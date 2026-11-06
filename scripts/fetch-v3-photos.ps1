$ErrorActionPreference = 'Stop'
$directory = Join-Path $PSScriptRoot '..\public\images\activity-templates'
$photos = @(
  @{id='campus-culture'; url='https://images.pexels.com/photos/30887767/pexels-photo-30887767.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='concert'; url='https://images.pexels.com/photos/7803636/pexels-photo-7803636.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='academic-conference'; url='https://images.pexels.com/photos/38786013/pexels-photo-38786013.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='large-charity'; url='https://images.pexels.com/photos/40736567/pexels-photo-40736567.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='exhibition'; url='https://images.pexels.com/photos/35138560/pexels-photo-35138560.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='graduation-show'; url='https://images.pexels.com/photos/31040302/pexels-photo-31040302.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='major-sports'; url='https://images.pexels.com/photos/35103195/pexels-photo-35103195.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='escape-room'; url='https://images.pexels.com/photos/29483111/pexels-photo-29483111.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='movie-night'; url='https://images.pexels.com/photos/8263324/pexels-photo-8263324.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='karaoke'; url='https://images.pexels.com/photos/6762300/pexels-photo-6762300.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='hotpot'; url='https://images.pexels.com/photos/16143648/pexels-photo-16143648.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='birthday'; url='https://images.pexels.com/photos/33038789/pexels-photo-33038789.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='costume'; url='https://images.pexels.com/photos/6923363/pexels-photo-6923363.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='gift-swap'; url='https://images.pexels.com/photos/7180794/pexels-photo-7180794.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='picnic'; url='https://images.pexels.com/photos/8530186/pexels-photo-8530186.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='camping'; url='https://images.pexels.com/photos/36729455/pexels-photo-36729455.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='hiking'; url='https://images.pexels.com/photos/7277036/pexels-photo-7277036.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='city-walk'; url='https://images.pexels.com/photos/35811628/pexels-photo-35811628.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='cycling'; url='https://images.pexels.com/photos/21370321/pexels-photo-21370321.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='sunset-photo'; url='https://images.pexels.com/photos/14060056/pexels-photo-14060056.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='frisbee'; url='https://images.pexels.com/photos/20836272/pexels-photo-20836272.png?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop&fm=jpg'},
  @{id='diy'; url='https://images.pexels.com/photos/13443302/pexels-photo-13443302.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='succulent'; url='https://images.pexels.com/photos/4507714/pexels-photo-4507714.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='jewelry'; url='https://images.pexels.com/photos/26310016/pexels-photo-26310016.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='painting'; url='https://images.pexels.com/photos/20173391/pexels-photo-20173391.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='book-club'; url='https://images.pexels.com/photos/7963813/pexels-photo-7963813.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='music-share'; url='https://images.pexels.com/photos/5845022/pexels-photo-5845022.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='food-share'; url='https://images.pexels.com/photos/6605273/pexels-photo-6605273.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='photo-talk'; url='https://images.pexels.com/photos/30697990/pexels-photo-30697990.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='skill-swap'; url='https://images.pexels.com/photos/9242832/pexels-photo-9242832.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='choir'; url='https://images.pexels.com/photos/7567326/pexels-photo-7567326.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='interest-meetup'; url='https://images.pexels.com/photos/36729766/pexels-photo-36729766.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='werewolf'; url='https://images.pexels.com/photos/8111370/pexels-photo-8111370.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='athletics'; url='https://images.pexels.com/photos/12698205/pexels-photo-12698205.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='fun-games'; url='https://images.pexels.com/photos/31940276/pexels-photo-31940276.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='badminton'; url='https://images.pexels.com/photos/8796050/pexels-photo-8796050.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='coffee'; url='https://images.pexels.com/photos/34933330/pexels-photo-34933330.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='club-recruit'; url='https://images.pexels.com/photos/13051314/pexels-photo-13051314.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='aroma'; url='https://images.pexels.com/photos/5933686/pexels-photo-5933686.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='secondhand'; url='https://images.pexels.com/photos/7130031/pexels-photo-7130031.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'},
  @{id='product-launch'; url='https://images.pexels.com/photos/34774355/pexels-photo-34774355.jpeg?auto=compress&cs=tinysrgb&w=960&h=540&fit=crop'}
)
foreach ($photo in $photos) {
  $target = Join-Path $directory ($photo.id + '.jpg')
  try {
    Invoke-WebRequest -Uri $photo.url -OutFile $target
    $bytes = [System.IO.File]::ReadAllBytes($target)
    if ($bytes.Length -lt 10000 -or $bytes[0] -ne 255 -or $bytes[1] -ne 216) { throw 'JPEG 校验失败' }
    Write-Output ($photo.id + ' ' + $bytes.Length)
  } catch {
    Write-Warning ($photo.id + ': ' + $_.Exception.Message)
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target }
  }
}
