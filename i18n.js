/**
 * @author      Created by Marcus Spiegel <marcus.spiegel@gmail.com> on 2011-03-25.
 * @link        https://github.com/mashpie/i18n-node
 * @license		http://creativecommons.org/licenses/by-sa/3.0/
 *
 * @version     0.3.4
 */

// dependencies
var vsprintf = require('sprintf').vsprintf,

    fs = require('fs'),
    url = require('url'),
    path = require('path'),

// defaults
    locales = {},
    defaultLocale = 'en',
    cookiename = null,
	debug = false;
    directory = './locales';
	
var Model;


// public exports
var i18n = exports;

i18n.setModel = function(model){
	Model = model;
};

i18n.locales = locales;

i18n.version = '0.3.4';

i18n.is_ready = false;

i18n.on_ready = [];

i18n.configure = function(opt){
    Model.find({},function(err,results)
    {
        for(var i=0; i<results.length; i++)
        {
            locales[results[i].locale] = results[i].text;
        }
        i18n.is_ready = true;
        i18n.on_ready.forEach(function(cbk)
        {
            cbk();
        });
    });
    // you may register helpers in global scope, up to you
    if( typeof opt.register === 'object' ){
        opt.register.__ = i18n.__;
        opt.register.__n = i18n.__n;
    }
};

i18n.ready = function(callback)
{
    i18n.on_ready.push(callback);
    if(i18n.is_ready)
        callback();
};

i18n.init = function(request, response, next) {
    if (typeof request === 'object') {
        guessLanguage(request);
    }
    if (typeof next === 'function') {
        next();
    }
};

i18n.__ = function() {
    var locale;
    if (this && this.scope) {
        locale = this.scope.locale;
    }
    var msg = translate(locale, arguments[0]);
    if (arguments.length > 1) {
        msg = vsprintf(msg, Array.prototype.slice.call(arguments, 1));
    }
    return msg;
};

i18n.__n = function() {
    var locale;
    if (this && this.scope) {
        locale = this.scope.locale;
    }
    var singular = arguments[0];
    var plural = arguments[1];
    var count = arguments[2];
    var msg = translate(locale, singular, plural);

    if (parseInt(count) > 1) {
        msg = vsprintf(msg.other, [count]);
    } else {
        msg = vsprintf(msg.one, [count]);
    }

    if (arguments.length > 3) {
        msg = vsprintf(msg, Array.prototype.slice.call(arguments, 3));
    }

    return msg;
};

// either gets called like 
// setLocale('en') or like
// setLocale(req, 'en')
i18n.setLocale = function(arg1, arg2) {
    var request = {},
        target_locale = arg1;

    if(arg2 && locales[arg2]){
        request = arg1;
        target_locale = arg2
    }
    
    if (locales[target_locale]) {
        request.locale = target_locale;
        defaultLocale = target_locale;
    }
    return i18n.getLocale(request);
};

i18n.getLocale = function(request) {
    if (request === undefined) {
        return defaultLocale;
    }
    return request.locale;
};

i18n.overrideLocaleFromQuery = function(req) {
    if (req == null) {
        return;
    }
    var urlObj = url.parse(req.url, true);
    if (urlObj.query.locale) {
        if (debug) console.log("Overriding locale from query: " + urlObj.query.locale);
        i18n.setLocale(req, urlObj.query.locale.toLowerCase());
    }
}

// ===================
// = private methods =
// ===================
// guess language setting based on http headers
function guessLanguage(request) {
    if (typeof request === 'object') {
        var language_header = request.headers['accept-language'],
        languages = [],
        regions = [];
        request.languages = [defaultLocale];
        request.regions = [defaultLocale];
        request.language = defaultLocale;
        request.region = defaultLocale;

        if (language_header) {
            language_header.split(',').forEach(function(l) {
                header = l.split(';', 1)[0];
                lr = header.split('-', 2);
                if (lr[0]) {
                    languages.push(lr[0].toLowerCase());
                }
                if (lr[1]) {
                    regions.push(lr[1].toLowerCase());
                }
            });

            if (languages.length > 0) {
                request.languages = languages;
                request.language = languages[0];
            }

            if (regions.length > 0) {
                request.regions = regions;
                request.region = regions[0];
            }
        }

        // setting the language by cookie
        if (cookiename && request.cookies[cookiename]) {
            request.language = request.cookies[cookiename];
        }

        i18n.setLocale(request, request.language);
    }
}

// read locale file, translate a msg and write to fs if new
function translate(locale, singular, plural) {
    var original_singular = singular;
    var original_plural = plural;
    singular = hash_key(singular);
    if(plural)
        plural = hash_key(plural);

    if (locale === undefined) {
      if (debug) console.warn("WARN: No locale found - check the context of the call to $__?");
      locale = defaultLocale;
    }
    
    if (!locales[locale]) {
        read(locale);
    }
    
    if (plural) {
        if (!locales[locale][singular]) {
            locales[locale][singular] = {
                'one': original_singular,
                'other': original_plural
            };
            write(locale);
        }
    }
    
    if (!locales[locale][singular]) {
        locales[locale][singular] = original_singular;
        write(locale);
    }
    return locales[locale][singular];
}

var crypto = require('crypto');
function hash_key(str) {
    if(str.length > 50)
        return crypto.createHash("md5").update(str.toString()).digest("hex");
    return str;

}


// try reading a file
function read(locale) {
    locales[locale] = cloneObject(locales['en']) || {};
    write(locale);
};

function cloneObject(obj) {
    if(!obj)
        return obj;
    var clone = {};
    for(var i in obj) {
        if(typeof(obj[i])=="object")
            clone[i] = cloneObject(obj[i]);
        else
            clone[i] = obj[i];
    }
    return clone;
}

// try writing a file in a created directory
function write(locale) {
    if(!i18n.is_ready)
        return;
    Model.update({locale:locale},{text:locales[locale]},{upsert:true},function(err,results)
    {
        if(err)
            console.error(err);
        console.log('finished writing locale to DB ' + locale);
    });
};

// basic normalization of filepath
function locate(locale) {
    return path.normalize(directory + '/' + locale + '.js');
}
