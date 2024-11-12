import puppeteer from "https://deno.land/x/puppeteer@16.2.0/mod.ts";

import express from 'express';
const app = express ();
app.use(express.json());
import * as cheerio from "cheerio"
import axios from "redaxios"
const PORT = 3000;

const browser = await puppeteer.launch();
const page = await browser.newPage();
app.listen(PORT, () => {
  console.log("Server Listening on PORT:", PORT);
});
var url = "https://anoboy.icu"

var $ = ""

var data = ""
function rep(str, obj) {
  for (const x in obj) {
    str = str.replace(new RegExp(x, 'g'), obj[x]);
  }
  return str;
}
async function geturl(x){

var html = "";
  await page.goto(x)
  html = await page.content();
 
return html

}

function rex(x,y,z,a){

if( a == "ok"){

         $(x).each( function(){
          if( $(this).attr(y) != undefined){
             if( !$(this).attr(y).startsWith("http") ){
    
                 $(this).attr(y , z+$(this).attr(y) )
    
             } else {
             
             let qq = $(this).attr(y).replace(url, z )
             $(this).attr(y , qq )
             
             }
          }
      })
      
      } else {

      $(x).each( function(){
          if( $(this).attr(y) != undefined){
             if( !$(this).attr(y).startsWith("http") ){
    
                 $(this).attr(y , z+$(this).attr(y) )
    
             }
          }
      })
    }
  }
    
function core(x){

    $("script[type='application/ld+json'], div[id^='ad'], #judi, #judi2, #disqus_thread, .sidebar, #coloma").remove()
    rex("link", "href", url)
    rex("script", "src", url)
    rex("img", "src" ,url)
    rex("amp-img", "src" ,url)
    rex("iframe", "src" ,url)
    rex( "a", "href" , x ,"ok")
  $(".footercopyright").append(`
  <style>
  #menu,   div.column-three-fourth  { width:100% !important;
           overflow: hidden;
          }

  
  </style>
  `)
}


app.get("/", async (req, res) => {
    $ = cheerio.load( await geturl( url ) );
    core(req.protocol+"://"+req.get("host") )


    try {
      
      return res.status(200).send(
         $.html()
      );
    } catch (err) {
      return res.status(500).json({
        err: err.toString(),
      });
    }
});

app.get('/:key*', async (req, res) => {

   var j = url+"/"+req.params.key+req.params[0]
   
   $ = cheerio.load( await geturl( j ) );
   core(req.protocol+"://"+req.get("host") )
      try {
      
      return res.status(200).send(
         $.html()
      );
    } catch (err) {
      return res.status(500).json({
        err: err.toString(),
      });
      }
});
