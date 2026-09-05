-- DESIGN.md 付録B 準拠
insert into public.nui_sizes (id, label, height_mm, sort_order) values
  (10,'10cm（ぬいぐるみS）',100,10),
  (15,'15cm（ぬいぐるみM）',150,20),
  (20,'20cm（ぬいぐるみL）',200,30),
  (0 ,'その他・フリーサイズ',0,99);

insert into public.categories (slug, name, sort_order) values
  ('furniture','家具・インテリア',10),
  ('accessory','アクセサリー・小物',20),
  ('stage','推し空間・ステージ',30),
  ('carry','おでかけ・キャリー',40),
  ('food','ミニチュアフード',50);

insert into public.tags (slug, name, kind) values
  ('ryosangata','量産型','worldview'),
  ('jirai','地雷系','worldview'),
  ('gothic','ゴシック','worldview'),
  ('natural','ナチュラル','worldview'),
  ('japanese','和風','worldview'),
  ('cafe','カフェ','worldview'),
  ('birthday','誕生日','event'),
  ('christmas','クリスマス','event');

insert into public.filaments (code, name, material, color_name, color_hex, finish, surcharge, sort_order) values
  ('PLA-WHT','PLA ミルクホワイト','PLA','ホワイト','#FAFAF7','matte',  0, 10),
  ('PLA-PNK','PLA ベビーピンク',  'PLA','ピンク',  '#F7C6D9','matte',  0, 20),
  ('PLA-BLK','PLA マットブラック','PLA','ブラック','#1C1C1C','matte',  0, 30),
  ('PLA-LAV','PLA ラベンダー',    'PLA','パープル','#C9B6E4','matte',  0, 40),
  ('SLK-GLD','シルク ゴールド',   'PLA','ゴールド','#D9B45B','silk', 200, 50),
  ('GLT-CLR','ラメクリア',        'PETG','クリア', '#E8F4F8','glitter',300,60);
