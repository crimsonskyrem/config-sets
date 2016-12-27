# -*- coding: utf-8 -*-
import scrapy
from wallhaven.items import WallhavenItem


class WhSpider(scrapy.Spider):
    name = "wh"
    allowed_domains = ["wallhaven.cc"]
    resolution = '1280x800'
    start_urls = ['https://alpha.wallhaven.cc/search?categories=100&purity=100&resolutions=%s&sorting=random&order=desc' % resolution]

    def parse(self, response):
        for link in response.xpath('//*[@id="thumbs"]/section[1]/ul//li/figure/a/@href').extract():
            yield scrapy.Request(url=link,callback=self.subparse)

    def subparse(self,response):
        url = "https:"
        body = response.xpath('//*[@id="wallpaper"]/@src').extract()
        url += body[0]
        yield {'image_urls':[url]}
