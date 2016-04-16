/**
 * Tokyo 7th Sisters: 7th パフォーマッチ イベントのじゃんけんゲーの最善手を総当りで求める
 */

$(document).ready(() => {
'use strict';

let version = '1.4.0';

const type = [
  { name: 'ボーカリスト', tag: 'Vo' },
  { name: 'バラドル',     tag: 'Va' },
  { name: 'モデル',       tag: 'Mo' },
  { name: 'プレイヤー',   tag: 'Pl' },
  { name: 'ダンサー',     tag: 'Da' },
  { name: 'ノータイプ',   tag: 'NT' },
];

const TYPECLASS = 'Vo Va Mo Pl Da NT ';

var unitSaveSlot = {};

//$オブジェクトのキャッシュ
var $body = $('body');
var $config = $('#config');
var $cell = $('.unit td');
var $manager = $('.unit');
var $result = $('#result-table tbody');
var $known = $('#known-unit-wrapper');
var $you = $('#you');
var $rival = $('#rival');
var $pline = $('#message');
var $savelist = $("#unit-data-list");

/** 昇順並び替え用コールバック */
var asc = (a,b) => a-b;
/** 階乗 */
var fact = function( n ) {
  return ( n <= 0 ) ? 1 : ( n * fact( n-1 ) );
};

//モバイル用タップイベント
let tap = 'click';
if ( 'ontouchstart' in window ) {
  let tapping = false;
  tap = 'tap';
  $(document).on({
    touchstart: () => { tapping = true; },
    touchmove: () => { tapping = false; }
  });
  let onTap = function(e){
    if ( !tapping ) return;
    tapping = false;
    $.event.dispatch.call(this, $.Event('tap', {
      originalEvent: e,
      target: e.target,
      pageX: e.changedTouches[0].pageX,
      pageY: e.changedTouches[0].pageY,
    }));
    return false;
  };
  $.event.special.tap = {
    setup: function(){ this.addEventListener( 'touchend', onTap, false); },
    teardown: function(){ this.removeEventListener('touchend', onTap, false); }
  };
}

/**
 * コンフィグ名前空間オブジェクト。
 * コンフィグ項目クラスのコンストラクタなどの集まり
 */
var config = { n: 0 };
/**
 * YES/NOの二者択一の選択肢
 * @constructor
 * @param {string} text - 項目のラベル
 * @param {boolean} [defVal=false] - デフォルト値
 */
config.YN = function( text, defVal ) {
  this.text = text;
  this.value = defVal||false;
  var name = 'TN'+config.n++;
  var $input = $('<input>').prop({
    type: 'checkbox',
    checked: this.value,
    id: name,
  }).on({
    change: () => {
      this.value = $input.prop('checked');
    },
  });
  this.$input = $('<p>').addClass('config-input').append( $input );
  var $label = $('<label>').text( text ).prop( 'for', name );
  this.$label = $('<p>').addClass('config-label').append( $label );
};
config.YN.prototype.set = function( value ){
  this.value = !!value;
  this.$input.children('input').prop({ checked: value });
}
/**
 * ラジオボックス型の選択肢
 * @constructor
 * @param {string} text - 項目のラベル
 * @param {string[]} option - 各選択肢のラベル
 * @param {number} [defVal=0] - デフォルトの選択肢
 */
config.Radio = function( text, option, defVal ) {
  this.value = defVal||0;
  var name = 'radio'+config.n++;
  this.text = text;
  this.$label = $('<p>').addClass('config-label').text( text );
  this.$input = $('<p>').addClass('config-input');
  for ( let i = 0, label; label = option[i]; i++ ) {
    let $label = $('<label>').text(label).prop('for', name+'-'+i);
    let $input = $('<input>').prop({
      type: 'radio',
      name: name,
      id: name + '-' + i,
      value: i,
      checked: i === this.value,
    }).on({
      change: (i => () => {
        this.value = i;
      })(i),
    });
    this.$input.append( $input, $label, '<br>' );
  }
};
config.Radio.prototype.set = function( value ) {
  this.value = parseInt( value );
  this.$input.children('input').prop({checked: false}).eq(value).prop({checked: true});
};
/**
 * 数値式の入力
 * @constructor
 * @param {string} text - 項目のラベル
 * @param {number} min - 最小値
 * @param {number} max - 最大値
 * @param {number} [defVal=min] - デフォルト値
 */
config.Quantity = function( text, min, max, defVal ) {
  this.text = text;
  this.$label = $('<p>').addClass('config-label').text( text );
  var $input = $('<input>').prop({
    type: 'number',
    min: min,
    max: max,
    value: defVal || min,
  }).addClass('config-number').on({
    change: () => {
      this.value = $input.val();
    },
  });
  this.$input = $('<p>').addClass('config-input').append( $input );
  this.value = defVal || min;
};
config.Quantity.prototype.set = function( value ) {
  this.value = value;
  this.$input.children('input').prop({value});
};

/**
 * コンフィグオブジェクト
 * これを元に$でhtml要素を生成する
 */
var option = {
  lowestBonus: new config.YN( '最下位ボーナスを適用', false ),
  countDrawAs: new config.Radio( '引き分けのカウント法', [
    '勝利としてカウント',
    '敗北としてカウント',
    '勝敗をランダムに決定',
  ], 1 ),
  countPerMatch: new config.Radio( '勝数カウント', [
    'マッチ勝数(3回勝負ごと)', '総合勝数(1回勝負ごと)'
  ]),
  ignoreUserType: new config.Radio( 'タイプ一致ボーナス', [
    '勝敗判定に使用する',
    '無視する',
  ]),
  resultDisplay: new config.Quantity( '結果の表示数', 1, 1680, 8 ),
  resetWhenRegroup: new config.YN( '編成変更時に確定枠をリセットする', true ),
  omitDuplicatedResults: new config.YN( 'ステージを並び替えて重複する結果を除外', false ),
  showProgress: new config.YN( '計算中プログレスバーを表示する', true ),
  messageFadeTime: new config.Quantity( 'メッセージの表示時間(秒)', 0, Infinity, 1 ),
};

//コンフィグオブジェクトからhtml要素を生成する
for ( var t in option ) {
  let $content = $('<div>').addClass('config-content').appendTo( $config );
  option[t].$label.appendTo( $content );
  option[t].$input.appendTo( $content );
}

//確定枠指定欄の作成
{
  let $fixerTemplate = $('.known-unit');
  for ( let i = 0; i < 3; i++ ) {
    let $fixer = $fixerTemplate.clone().removeClass('template').appendTo( $known );
    let $caption = $fixer.find('.unit-caption').text( ['1st','2nd','3rd'][i] + ' Stage' );
    let $expect = $('<span>').addClass('expectation').appendTo( $caption ).on({
      [tap]: function(e){
        var $this = $(this);
        $this.toggleClass('win lose')
          .text( ($this.text()==='WIN')?'LOSE':'WIN' );
      }
    });
    $fixer.find('td:not(:last-child)').addClass( 'idol' ).on({
      [tap]: function(e){
        var $this = $(this);
        selectType( e, t => {
          $this.removeClass('error');
          changeCellType( $this, t );
          let user = $this.data('manager');
          try {
            user.input();
          } catch(e) {
            pline(e);
            user.resetFix();
          }
          if ( $( 'td:empty', $fixer ).length === 0 ) {
            expect( $fixer, $expect );
          } else {
            $expect.empty().removeClass('win lose');
          }
        }, true );
        return false;
      }
    });
    $fixer.find('td:last-child').append(
      $('<a class="button">').text('Reset').on({
        [tap]: function(){
          var $this = $(this);
          $this.parent().siblings('td').empty().removeClass( TYPECLASS + 'error' );
          $expect.empty().removeClass('win lose');
        }
      })
    );
  }
  /** 確定枠の配列から勝敗を推定する */
  var expect = function( $fixer, $expect ) {
    var $idol = $fixer.find('.idol').not(':empty');
    if ( $idol.length !== 6 ) return;
    var idol = [[],[]];
    for ( let i = 0; i < 3; i ++ ) {
      idol[0].push( $idol.eq( i ).data('type') );
      idol[1].push( $idol.eq(i+3).data('type') );
    }
    var result = match( $idol.first().data('manager').type, idol[0], $idol.last().data('manager').type, idol[1] );
    $expect.text( result?'WIN':'LOSE' ).removeClass('win lose').addClass( result?'win':'lose' );
  };

  $fixerTemplate.remove();
}

/** 優位属性を求める */
var superior = function( v ) {
  if ( v < 0 || v >= 5 || !isFinite(v) ) return NaN;
  return ( v + 1 ) % 5;
};

/**
 * アイドル同士の1vs1のバトルをシミュレートする。
 * @return {number} 属性勝ちで+3, 判定勝ちで+1, 引き分けで0
 */
var battle = function( p1, c1, p2, c2 ) {
  if ( superior(c1) === c2 ) return  3;
  else if ( c1 === superior(c2) ) return -3;
  else if ( option.ignoreUserType.value === 0 && p1 === c1 && p2 !== c2 ) return  1;
  else if ( option.ignoreUserType.value === 0 && p1 !== c1 && p2 === c2 ) return -1;
  else if ( option.lowestBonus.value ) return 1;
  else return 0;
};

var victory = 0; //指定欄で勝利が確定した数
var defeat = 0;  //指定欄で敗北が確定した数

/**
 * 1vs1を3回繰り返して1ユニット分の勝敗を確定する
 * @param {number} p1 - ユーザーの属性
 * @param {number[]} u1 - ユニット3人分の属性
 * @param {number} p2 - 相手ユーザーの属性
 * @param {number[]} u2 - 相手ユニット3人分の属性
 * @return {boolean} 勝敗
 */
var match = function( p1, u1, p2, u2 ) {
  var win = victory - defeat;
  for ( let i = victory + defeat; i < 3; i++ ) {
    let score = 0;
    for ( let j = 0; j < 3; j++ ) {
      score += battle( p1, u1[3*i+j], p2, u2[3*i+j] );
    }
    
    if ( score > 0 ) {
      win++;
    } else if ( option.countPerMatch.value === 1 ) {
      if ( score === 0 ) {
        switch ( option.countDrawAs.value ) {
        case 0: win++; break;
        case 2: win += Math.round( Math.random() ); break;
        }
      }
    } else if ( score < 0 ) win--;
    
    if ( option.countPerMatch.value === 0 && Math.abs( win ) >= 2 ) return win > 0;
  }
  if ( option.countPerMatch.value === 1 ) return Math.max( win, 0 );
  if ( win !== 0 ) return win > 0;
  switch( option.countDrawAs.value ){
  case 0: return true;
  case 1: return false;
  case 2: return Math.random() > .5;
  }
};

/**
 * @classdesc 支配人クラス
 * @constructor
 * @param {number} type - チーム属性
 * @param {number[]} unit - ユニット配列
 */
var Manager = function( $area, $def ) {
  this.type = 0;
  this.unit = [0,0,0,0,0,0,0,0,0];
  this.fixed = [];
  this.rest = this.unit;
  
  this.$ = $area;
  this.$table = $area.children('.unit').data('manager',this);
  this.$cell = $area.find('.unit td');
  this.$pattern = $area.find('.pattern');
  this.$known = $def.children('td:not(:last-child)').data('manager',this);
};
Manager.prototype = {
  /** ユニット配列の並び替えで生成され得る順列の総数を返す */
  getPattern: function(){
    var q = [0,0,0,0,0];
    for ( let i = 0; i < 9; i++ ) {
      q[this.unit[i]]++;
    }
    var p = 362880;
    for ( let i = 0; i < 5; i++ ) {
      p /= fact(q[i]);
    }
    return p;
  },
  /** 固定枠をリセットする */
  resetFix: function(){
    this.fixed = [];
    this.rest = [].concat( this.unit );
  },
  /** ユニット配列を昇順に並び替える */
  sort: function(){
    this.unit.sort( asc );
    this.rest.sort( asc );
  },
  /** テーブルをデータに反映させる */
  input: function(){
    this.type = this.$table.data('type');
    this.$cell.each( ( i, cell ) => {
      var t = $(cell).data('type');
      this.unit[i] = t;
    });
    this.resetFix();
    for ( let i = 0; i < 9; i++ ) {
      let $cell = this.$known.eq(i);
      if ( $cell.text() === '' ) break;
      let t = $cell.removeClass('error').data('type');
      this.fixed.push(t);
      let idx = this.rest.indexOf(t);
      if ( idx < 0 ) {
        $cell.addClass('error');
        throw '確定欄のユニットが編成不可能な組合せです';
        return;
      }
      this.rest.splice( idx, 1 );
    };
    this.sort();
  },
  /** データをテーブルに反映させる */
  output: function(){
    let tag = type[ this.type ].tag;
    this.$table.data('type', this.type).removeClass('Vo Va Mo Pl Da').addClass(tag);
    for ( let i = 0; i < 9; i++ ) {
      changeCellType( this.$cell.eq(i), this.unit[i] );
    }
  },
  /**
   * ユニットデータをブラウザに保存する
   * @param {string} id - スロットID
   */
  save: function( id ){
    if ( !unitSaveSlot.hasOwnProperty(id) ) {
      $('<option>').text(id).prop({ val: id }).appendTo( $savelist );
    }
    unitSaveSlot[id] = { type: this.type, unit: [].concat(this.unit) };
    var json = JSON.stringify(unitSaveSlot);
    window.localStorage.setItem( 'unit', json );
    window.localStorage.setItem( 'default_unit', id );
    pline( `[${id}]を保存しました` );
  },
  /**
   * ユニットデータがブラウザに保存されていたならそれを読みだす
   */
  load: function( id ){
    let data = unitSaveSlot[id];
    if ( data ) {
      this.type = data.type;
      this.unit = [].concat(data.unit||[0,0,0,0,0,0,0,0,0]);
      this.output();
      window.localStorage.setItem( 'default_unit', id );
    } else {
      throw( `[${id}]にはユニットデータがありません` );
    }
  },
};

/** 自身と相手のデータオブジェクト */
var manager = [
  new Manager( $you, $('.you.used-unit') ),
  new Manager( $rival, $('.rival.used-unit') )
];

/**
 * 属性選択用ハンドラを表示する
 * @param {Event} e - イベント変数
 * @param {function(number)} callback - 選択後に呼ばれるコールバック
 * @param {boolean} [withNT=false] - ノータイプを選択肢に表示するか
 */
var selectType = function( e, callback, withNT ) {
  var qType = withNT ? 6 : 5;
  $('.type-select').remove();
  $cell.removeClass( 'selecting' );
  var $list = $('<ul>').addClass('type-select').appendTo( $body ).css({top: e.pageY, left: e.pageX});
  for ( let i = 0; i < qType; i++ ) {
    let $li = $('<a>').text( type[i].tag ).addClass( type[i].tag ).attr({title:type[i].name});
    $li.on({
      [tap]: ( i => e => {
        callback( i );
        closeSelect(e);
        return false;
      })(i)
    }).appendTo($list).wrap('<li class="type-option">');
  }
  e.stopPropagation();
};
/** 属性選択ウィンドウを閉じる */
var closeSelect = function(e){
  var $list = $('.type-select').eq(0);
  $list.addClass('dispose').delay(150).queue( next => {
    $list.hide().remove();
  });
  $cell.removeClass('selecting');
  e.stopPropagation();
}
/**
 * テーブルのセルの属性を任意に変える
 * @param {$} $cell - 変更するセルの$オブジェクト
 * @param {number} t - 属性
 */
var changeCellType = function( $cell, t ) {
  var tag = type[t].tag;
  $cell.removeClass('Vo Va Mo Pl Da NT selecting').addClass( tag ).text( tag ).data('type',t);
};

//チーム属性選択ダイアログを表示
$manager.on({
  [tap]: function(e){
    var $this = $(this);
    selectType( e, function( i ){
      var tag = type[i].tag;
      $this.removeClass('Vo Va Mo Pl Da').addClass( tag ).data('type',i);
      $this.data('manager').input();
    }, false );
    return false;
  },
}).addClass('Vo').data('type',0);
//ユニットメンバー選択ダイアログを表示
$cell.on({
  [tap]: function(e){
    var $this = $(this);
    if ( option.resetWhenRegroup.value ) resetFixing();
    selectType( e, function( i ){
      changeCellType( $this, i );
      try { $this.closest('table').data('manager').input(); }
      catch(e){
        if( e instanceof Error ) console.error(e);
        else pline(e);
      }
    }, true );
    $this.addClass( 'selecting' );
    return false;
  },
}).text('Vo').addClass('Vo').data('type',0);

$body.on({ [tap]: closeSelect });

//総当りを試す一連の処理
{
  let $progress = $('#progress');
  let $bar = $('#bar');
  let progress = 0;
  let barLength = 0;
  let results = [];
  $('#VS').on({
    [tap]: function(){
      new Promise( resolve => {
        $result.empty();
        manager[0].input();
        manager[1].input();
        $progress.show();
        victory = $('.win').length;
        defeat = $('.lose').length;
        setTimeout( resolve, 0 );
      }).then( isReadyToCalc ).then( () => {
        return bruteforce( manager[0], manager[1] );
      }).catch( e => {
        if ( e instanceof Error ) console.error(e);
        else pline(e);
        if ( window.ga ) {
          ga( 'send', 'exception', {
            exDescription: e.message||e,
            exFatal: e instanceof Error
          });
        }
      }).then( () => {
        $progress.fadeOut();
        $bar.fadeOut();
      });
    }
  });

  /** 計算前の条件チェック */
  let isReadyToCalc = function(){
    return new Promise( (resolve, reject) => {
      for ( let i = 0; i < 2; i ++ ) {
        let fixed = manager[i].fixed.length;
        if ( fixed % 3 > 0 ) {
          manager[i].$known.eq(fixed).addClass('error');
          return reject( '確定枠はステージ(3人)単位で指定してください。' );
        }
      }
      resolve();
    });
  };

  let calcTimer = 0;
  /**
   * ブルートフォースでの確率計算
   * @param {Manager} p1 - 自分
   * @param {Manager} p2 - 相手
   */
  let bruteforce = function( p1, p2 ) {
    if ( window.performance ) calcTimer = performance.now();
    var u2s = [];
    u2s = permute( p2.fixed, p2.rest, p2.rest.length );

    var u1s = [], u1fix = [];
    var gap = p2.fixed.length - p1.fixed.length;
    if ( gap > 0 ) {
      //相手の固定枠の方が長い場合はその分だけ総当りを試す
      let u1fix = permute( p1.fixed, p1.rest, gap );
      for ( let i = 0, fix; fix = u1fix[i]; i++ ) {
        //残りを重複なし組合せで取り出す
        let rest = p1.unit.slice(0);
        for ( let j = 0, l = fix.length; j < l; j++ ) {
          rest.splice( rest.indexOf( fix[j] ), 1 );
        }
        u1s = u1s.concat( makeUniqueUnits( rest, fix ) );
      }
    } else {
      u1s = makeUniqueUnits( p1.rest, p1.fixed );
    }
    
    return promiseBF( u1s, u2s );
  };

  /** プログレスバーの更新 */
  let updateProgressBar = function(){
    progress++;
    var percentage = Math.round( progress * 100 / barLength );
    $bar.width(`${percentage}%`);
  };
  /** 一つのユニットの勝率を計算する */
  let evalUnit = function( u, u2s ){
    return new Promise( resolve => {
      var result = { unit: u, win: 0 };
      for ( let i = 0, u2; u2 = u2s[i]; i++ ) {
        let win = match( manager[0], u, manager[1], u2 );
        if ( option.countPerMatch.value === 1 ) result.win += win;
        else if ( win ) result.win++;
      }
      results.push( result );
      if ( option.showProgress.value ) {
        updateProgressBar();
      }
      setTimeout( resolve, 0 );
    });
  };
  /** ブルートフォースのプロミス部分 */
  let promiseBF = function( u1s, u2s ){
    //プログレスバーのリセット
    progress = 0;
    barLength = u1s.length;
    if ( option.showProgress.value ) $bar.width(0).show();
    
    //プロミスオブジェクトの作成
    results = [];
    var p = Promise.resolve();
    for ( let i = 0, li = u1s.length; i < li; i++ ) {
      p = p.then( evalUnit.bind( null, u1s[i], u2s ) );
    }
    return p.then( () => {
      results.sort( function(a,b){ return b.win-a.win; } );
      let i = 0, n = 0, rank = 0;
      let max = parseInt( option.resultDisplay.value ) || 10;
      let honored = [];
      let fixed = Math.max( manager[0].fixed.length, manager[1].fixed.length );
      while ( n < max && results[i] ) {
        let r = results[i];
        if ( i > 0 && r.win === results[i-1].win && option.omitDuplicatedResults.value ){
          if( isCongruent( r.unit, honored, fixed ) ) {
            i++;
            continue;
          }
        } else {
          rank = n+1;
        }
        honored.push( r.unit.toString() );
        makeResultLine( rank, r.unit, ( r.win / u2s.length ).toFixed(3) );
        i++; n++;
      }
      if ( window.ga ){
        ga( 'send', 'event', 'fixed', 'you', manager[0].fixed.length );
        ga( 'send', 'event', 'fixed', 'rival', manager[1].fixed.length );
        for ( let k in option ) {
          if ( option.hasOwnProperty( k ) ) ga( 'send', 'event', 'config', option[k].text, option[k].value );
        }
        if ( window.performance ) {
          let code = `${manager[0].fixed.length}:${manager[1].fixed.length}`;
          ga( 'send', 'timing', 'Calculation', code, performance.now() - calcTimer );
        }
      }
    });
  };
  /**
   * 結果テーブルの1行を作る
   * @param {number} rank - 順位
   * @param {number[]} unit - ユニット配列
   * @param {number} wp - 勝率
   */
  let makeResultLine = function( rank, unit, wp ) {
    let $tr = $('<tr>').appendTo( $result ).append( $('<td>').text( rank ).addClass('rank') );
    for ( let i = 0; i < 3; i++ ) {
      let $unit = $('<td>').addClass('unit3-wrapper').appendTo( $tr );
      for ( let j = 0; j < 3; j++ ) {
        let tag = type[ unit[i*3+j] ].tag;
        $('<div>').addClass( 'idol ' + tag )
          .text( tag )
          .data( 'type', unit[i*3+j] )
          .appendTo( $unit );
      }
    }
    $('<td>').text( wp ).appendTo($tr).addClass('rate');
    let $copyButton = [
      makeCopyButton( 1, $tr ), makeCopyButton( 2, $tr )
    ];
    $('<td>').addClass('util').append( $copyButton ).appendTo($tr);
  };
  //確定枠コピーボタン
  let makeCopyButton = function( n, $tr ){
    return $('<a>').text(n)
      .on({[tap]: copyResult.bind( null, n, $tr )})
      .addClass('copy button')
      .attr('title', `${['1st','2nd','3rd'][n-1]}ステージの並びを確定欄に反映`);
  };
  /**
   * ステージ順の重複をチェック
   * @param {Array} a - チェックする配列
   * @param {Array} tests - テストする配列の配列
   * @param {number} f - 固定枠の長さ
   */
  let isCongruent = function( a, tests, f ) {
    if ( f >= 6 ) return false;
    if ( f <= 3 ) {
      if ( ~tests.indexOf( [a[0],a[1],a[2], a[6],a[7],a[8], a[3],a[4],a[5]].toString() ) ) return true;
    }
    if ( f === 0 ) {
      if ( ~tests.indexOf( [a[6],a[7],a[8], a[0],a[1],a[2], a[3],a[4],a[5]].toString() ) ) return true;
      if ( ~tests.indexOf( [a[6],a[7],a[8], a[3],a[4],a[5], a[0],a[1],a[2]].toString() ) ) return true;
      if ( ~tests.indexOf( [a[3],a[4],a[5], a[0],a[1],a[2], a[6],a[7],a[8]].toString() ) ) return true;
      if ( ~tests.indexOf( [a[3],a[4],a[5], a[6],a[7],a[8], a[0],a[1],a[2]].toString() ) ) return true;
    }
    return false;
  };
}

/**
 * 結果を確定欄にコピーする
 * @param {number} n - コピーするステージ番号
 * @param {$} $tr - 結果の行
 */
var copyResult = function( n, $tr ){
  var $idol = $tr.find('.idol');
  var unit = [];
  for ( let i = (n-1)*3; i < n*3; i++ ) {
    let type = $idol.eq(i).data('type');
    changeCellType( manager[0].$known.eq(i), type );
  }
  var $unit = $('.known-unit').eq(n-1);
  expect( $unit, $unit.find('.expectation') );
  manager[0].input();
}

//リセットボタン
$('#reset-all').on({
  [tap]: () => {
    $result.empty();
    resetFixing();
  }
});
/**
 * 9人ユニットから並び替え可能な重複しない全ての順列を作る
 * @param {Array} fixed - 途中までの固定枠
 * @param {Array} free - 未定枠
 * @param {number} n - 最終的に作られる配列の長さ
 * @return {Array[]} 全ての順列
 */
var permute = function( fixed, free, n ) {
  var unit = [];
  (function _permute( pre, post, n ) {
    if ( n > 0 ) {
      for ( let i = 0, l = post.length; i < l; i++ ) {
        if ( i > 0 &&  post[i] === post[i-1] ) continue;
        let rest = [].concat( post );
        let elem = rest.splice( i, 1 );
        _permute( pre.concat(elem), rest, n - 1 );
      }
    } else {
      unit.push( pre );
    }
  }( fixed, free, n ));
  return unit;
};

/**
 * 9人の配列からユニークな3つのユニットの組み合わせを作る
 * @param {number[]} m - メンバーの配列
 * @param {number[]} [f=[]] - 前置される配列。固定枠
 * @return {Array[]} ユニークな組合せの配列 
 */
var makeUniqueUnits = function( m, f ) {
  if ( !m.length ) return [f];
  m.sort( asc );
  f = f || [];
  let n = m.length;
  if ( n === 3 ) return [f.concat(m)];
  let pool = [];
  for( let i = 0; i < n-2; i++ ) {
    if ( i > 0 && m[i] === m[i-1] ) continue;
    for ( let j = i+1; j < n-1; j++ ) {
      if ( j > i+1 && m[j] === m[j-1] ) continue;
      for ( let k = j+1; k < n; k++ ) {
        if ( k > j+1 && m[k] === m[k-1] ) continue;
        let unit = [ m[i], m[j], m[k] ];
        if ( pool[0] !== unit ) {
          let c = m.slice(0);
          c.splice( k, 1 );
          c.splice( j, 1 );
          c.splice( i, 1 );
          let u = makeUniqueUnits( c, f.slice(3) );
          for ( let v = 0, w = u.length; v < w; v++ ) {
            pool.push( f.concat( unit, u[v] ) );
          }
        }
      }
    }
  }
  return pool;
};

//テンプレ編成ボタンを作成するブロック
{
  let template = [{
    text: '単色染め',
    generate: m => {
      var a = m.type;
      m.unit = [a,a,a,a,a,a,a,a,a];
    },
  }, {
    text: '両翼楔型',
    generate: m => {
      var a = m.type;
      var b = (a + 2) % 5;
      var c = (a + 3) % 5;
      m.unit = [a,a,a,b,b,b,c,c,c];
    },
  }, {
    text: '楔型弱点カバー',
    generate: m => {
      var a = m.type;
      var b = (a + 3) % 5;
      var c = (b + 3) % 5;
      m.unit = [a,a,a,b,b,b,c,c,c];
    },
  }, {
    text: '63弱点カバー',
    generate: m => {
      var a = m.type;
      var b = (a + 3) % 5;
      m.unit = [a,a,a,a,a,a,b,b,b];
    },
  }, {
    text: 'ランダム',
    generate: m => {
      m.type = Math.floor( Math.random() * 5 );
      for ( var i = 0; i < 9; i++ ){
        m.unit[i] = Math.floor( Math.random() * 5 );
      }
    },
  }];
  //相手のテンプレ編成ボタン
  let $buttonBox = $('<ul>').appendTo('#rival-template');
  for ( let i = 0; i < template.length; i++ ) {
    let tmp = template[i];
    $('<a>').addClass('button').on({
      [tap]: () => {
        resetFixing();
        tmp.generate( manager[1] );
        manager[1].output();
      }
    }).text( tmp.text ).appendTo($buttonBox).wrap('<li>');
  }
}

/** 確定枠指定欄をリセット */
var resetFixing = function(){
  for ( let i = 0; i < 2; i++ ) {
    manager[i].$known.removeClass(TYPECLASS + 'error').empty();
    manager[i].fixed = [];
    manager[i].rest = manager[i].unit;
  }
  $('.expectation').empty().removeClass('win lose');
};

/** メッセージを表示する */
var pline = function( text ){
  var time = option.messageFadeTime.value * 1000;
  $pline.text( text ).show().delay( time ).fadeOut({ complete: function(){$pline.text('');} });
  console.info( text );
};

//モーダルウィンドウ関連
{
  let $modal = $('#overlay');
  let $dialog;
  let onClose = () => 0;
  let openModal = ( $d, callback ) => {
    if ( !$modal.has( $d ) ) return false;
    $dialog = $d;
    onClose = callback;
    $modal.fadeIn({ easing: 'easeOutExpo' });
    $d.animate({ top: '10%' }, { easing: 'easeOutBack' });
  };
  /** モーダル(コンフィグ)を閉じる */
  var closeModal = () => {
    $dialog.animate({ top: '200%' }, { easing: 'easeInBack' });
    $modal.fadeOut({ easing: 'easeInExpo' });
    if ( onClose ) onClose();
  };
  $modal.on({
    [tap]: closeModal
  }).children().on({
    [tap]: e => { e.stopPropagation(); }
  });
  $('.close-button').text('×').on({
    [tap]: closeModal
  });
  //コンフィグウィンドウ関連
  $('#config-button').on({
    [tap]: () => {
      openModal( $config, () => {
        //ブラウザに設定を保存する
        var data = {};
        for ( let k in option ) {
          if ( option.hasOwnProperty(k) ) data[k] = option[k].value;
        }
        var json = JSON.stringify( data );
        window.localStorage.setItem( 'config', json );
      });
    }
  });
  //セーブ関連
  {
    let onFocus = () => { $input.select(); return false; };
    let $input = $('#input-save-name').on({
      [tap]: onFocus,
      focus: onFocus,
    });
    let $save = $('#save-dialog');
    $save.find('.button').on({ [tap]: () => {
      let key = $input.val();
      manager[0].save( key );
      enableSaveList();
      $savelist.val( key );
      closeModal();
    }});
    $('#save-unit').addClass('save').on({
      [tap]: () => {
        openModal( $save, () => 0 );
      }
    });
    let $info = $('#simple-dialog');
    let $text = $('#dialog-text');
    let $ok = $('#dialog-ok');
    $info.find('.button').on({[tap]: closeModal});

    $savelist.on({
      change: () => {
        $input.val( $savelist.val() );
        manager[0].load( $savelist.val() );
      }
    });
    /** 
     * 保存したユニットデータを削除する
     * @param {string} key - ユニット名
     * @param {$} $option - 対応するoption要素
     */
    let deleteSave = ( key, $option ) => {
      $option.remove();
      delete unitSaveSlot[key];
      window.localStorage.setItem( 'unit', JSON.stringify( unitSaveSlot ) );
      window.localStorage.setItem( 'default_unit', $savelist.children().first().val() );
      if ( Object.keys( unitSaveSlot ).length === 0 ) disableSaveList();
    };
    var disableSaveList = () => {
        $savelist.attr({disabled:'disabled'});
        $delete.addClass('no-data');
    };
    var enableSaveList = () => {
        $savelist.removeAttr('disabled');
        $delete.removeClass('no-data');
    };
    let $delete = $('#delete-unit').on({
      [tap]: () => {
        let $selected = $savelist.find('option:selected');
        let key = $selected.text();
        $text.text(`本当に[${key}]を削除してもよろしいですか？`);
        $ok.off('.delete').on( tap+'.delete', () => {
          pline(`[${key}]を削除しました。`)
          deleteSave( key, $selected );
        });
        openModal( $info, ()=>0 );
      }
    });
  } //セーブ関連ブロック
  //メモ機能
  {
    let $memo = $('#memo');
    let $text = $memo.find('textarea');
    let onFocus = () => {
      $text.off('.initial').empty();
    };
    let saved = window.localStorage.getItem('memo');
    if ( !saved ) {
      $text.text(
        '簡易メモです。\n' +
        'このページを閉じると保存されていない内容は失われます。\n' +
        '単色構成支配人の名前を記録するのに使うといいんじゃないですかね。'
      ).on({
        [tap + '.initial']: onFocus,
        'focus.initial': onFocus,
      });
    } else {
      $text.val( saved );
    }
    $('#open-memo').on({ [tap]: () => {
      openModal( $memo, ()=>0 );
    }});
    $('#save-memo').on({ [tap]: () => {
      if ( !$text.val() || !window.localStorage ) return false;
      window.localStorage.setItem( 'memo', $text.val() );
      pline('メモの内容をブラウザに保存しました。');
    }});
    $('#delete-memo').on({ [tap]: () => {
      $text.val('').empty();
    }});
  } //メモ機能ブロック
} //モーダル関連ブロック



//初期化処理
Promise.resolve(0).then( () => {
  //javascript無効状態の警告文を消す
  $('#unable-js').remove();
  $('#unit-area').show();
  $('#version').text( `ver. ${version}` );
  //ユニットデータを読みだす
  let json = window.localStorage.getItem( 'unit' );
  if ( json ) {
    let data = JSON.parse( json );
    for ( let k in data ) {
      unitSaveSlot[k] = data[k];
      $('<option>').text(k).prop({ val: k }).appendTo( $savelist );
      enableSaveList();
    }
    let slot = window.localStorage.getItem( 'default_unit' );
    if ( ( slot !== void 0 ) && unitSaveSlot[slot] ) {
      manager[0].load(slot);
      $savelist.val( slot );
    }
  }
}).catch( e => {
  console.debug( '初期化処理に失敗しました', e );
  window.localStorage.clear();
}).then( () => {
  //コンフィグファイルの読み込み
  var json = window.localStorage.getItem( 'config' );
  if ( json ) {
    let data = JSON.parse(json);
    for ( let k in data ) {
      if ( option.hasOwnProperty(k) ) option[k].set( data[k] );
    }
  }
});

});

if ( !window.Promise ) {
  if ( window.ga ) ga( 'send', 'exception', {
    exDescription: 'Promise unsupported',
    exFatal: true
  });
}
