<h1 align="center">
  <br>
  <a href="https://github.com/hrishioa/wishful-search"><img src="https://github.com/hrishioa/wishful-search/assets/973967/ebd2d4cc-12d5-4916-b7c2-26cd234905d6" alt="WishfulSearch" width="100"></a>
  <br>
  WishfulSearch
  <br>
</h1>

<h3 align="center">Multi-model natural language search for any JSON.</h3>

<div align="center">

  [![Twitter Follow](https://img.shields.io/twitter/follow/hrishi?style=social)](https://twitter.com/hrishioa) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

</div>

<p align="center">
  <a href="#key-features">Key Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#example-movies">Demo: Search Movies</a> •
  <a href="#how-it-works">How it works</a>
</p>

// include screenshot here

WishfulSearch allows you to search JSON arrays simply with natural language.

Take any JSON array you have (notifications, movies, flights, people) and filter it with complex questions. WishfulSearch takes care of the prompting, database management, object-to-relational conversion and query formatting.

_This repo is the work of one overworked dev, and meant to be for educational purposes. Use at your own risk!_

# Usage

### 1. Create an LLM adapter

An LLM adapter is WishfulSearch's abstraction over an LLM API. You can set up WishfulSearch to work with a variety of model providers (OpenAI, Anthropic, Mistral etc.).

OpenAI:

```typescript
import OpenAI from 'openai';
const openai = new OpenAI();

const adapter = LLMAdapters.getOpenAIAdapter(openai, {
  model: 'gpt-4',
});
```

Anthropic:

``` typescript
import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic();

const adapter = LLMAdapters.getClaudeAdapter(
  Anthropic.HUMAN_PROMPT,
  Anthropic.AI_PROMPT,
  anthropic,
  {
    model: 'claude-2',
  },
);
```

Mistral (via [Ollama](https://ollama.ai) installed and running on your machine locally):

```typescript
const adapter = LLMAdapters.getMistralAdapter({
  model: 'mistral',
  temperature: 0.1,
});
```

### 2. Define a search engine 

Describe how the library should handle your data by creating a `WishfulSearchEngine`.

```typescript
const wishfulSearchEngine = await WishfulSearchEngine.create(
    'flights', // Name for your search instance, for labelling
    MOVIES_DDL, // Structured DDL
    {
      table: 'Movies', // Primary table
      column: 'id', // Primary id column
    },
    movieToRows, // Object to relational function
    {
      enableTodaysDate: true, // Inform the model about the date
      fewShotLearning: [], // Few-shot examples
    },
    GPT4LLMAdapter.callLLM, // LLM calling function
    (movie: Movie) => movie.id, // Object to id function
    true, // Save question history?
    true, // Enable dynamic enums on insert?
    true // Sort dynamic enums by frequency? Light performance penalty on insert but better searches and token savings
  	undefined // sql.js wasm URL
  );
```

### 3. Search

Load your data and search.

```typescript
const errors = wishfulSearchEngine.insert(TEST_MOVIES);

const results = (await wishfulSearchEngine.search(
  'Something romantic but not very short from the 80s',
)) as Movie[];
```

# Key Features

- **AI Quickstart - just bring an object**
  - Generate everything you need to use the library from a single, untyped JS object. Schema, functions, all of it.
  
- **Database Batteries Included**
  - WishfulSearch comes included with a performant sqlite database bundled for use, managed by the module.
  
- **Server and client-side**

  - Includes [bundled file from CDN](https://cdn.jsdelivr.net/npm/wishful-search@0.0.3/release/wishful-search.min.js) to import as a script, or install from npm.

- **Automated few-shot generation**

  - Use a smarter model to generate few-shot examples from a few questions, retemplate and insert into a prompt of a local model for instantly better results.

- **Multi-model**
  - GPT, Claude, Mistral adapters (OpenAI, Anthropic and [Ollama](https://ollama.ai/)) are provided, with specific-model template generation from the same input with advanced things like model-resume. Feel free to swap models midway through a conversation!

* **Single production dependency**
  - The only prod dependency is [sql.js](https://github.com/sql-js/sql.js), so you're not dragging along [Guy Fieri](https://nodesource.com/blog/is-guy-fieri-in-your-node-js-packages/) if you don't want to.
  
* **Exposed prompts - do your own thing**
  - Use the entire functionality, or don't. Most key functions are exposed, including those for prompt generation. Use as you wish.

### Better Search

- **Search history**
  - The LLM is appropriately fed past queries, so users can ask contextual questions ('What trains go to paris?' followed by 'any leaving at 10 am') and have auto-merged filters.
- **Automated Dynamic Enums**
  - The structured DDL format used internally (and generated by the AI Quickstart) contains the option for you to propose static examples for each column, to make the contents of a field clear to the model. WishfulSearch can also dynamically generate example values (with type detection) on each insert, so this is done with no effort. It can also pick the most frequent values in a column, or find the range and pass that on for token savings.
- **Safer search**
  - While running auto-generated queries can never be properly safe. WishfulSearch implements a few filters to sanitize the output, as well only having the LLM generate partial queries to try and improve safety. Ideally this is used in cases where having the entire db exposed to the user is not a security risk.

# Installation

Server:

```bash
npm i wishful-search
```

Client:

Just get the [bundled wishfulsearch.js](https://cdn.jsdelivr.net/npm/wishful-search@0.0.3/release/wishful-search.min.js), or compile a smaller one yourself from source. More instructions coming if this ends up a common use-case.

## AI Quickstart

WishfulSearch needs three things from you:

1. Structured DDL: This is just an object that encodes the column names, types, examples, description and so on, in the SQL tables that are created.
2. ObjectToRelational Function: This is the function that takes a (nested) object and converts it to flat rows that can be inserted into tables.
3. Primary table and column: Just the name of the main table (usually the first one) and the column inside the main table to be used as the retrieval id.
4. (Optional) Few-shot learning: [This is the most useful thing you can do](https://olickel.com/everything-i-know-about-prompting-llms#fewshotlearningtakethebotfishing) to improve performance. Look through the examples, or generate your own at runtime with a function call.
5. (Optional) sql.js wasm file: If you use this client-side, you'll need to provide a URL or a file that sql.js can use to do it's thing. [You can look here](https://github.com/sql-js/sql.js#usage) for more information.

All of the required pieces can be generated by the AI Quickstart:

```typescript
import OpenAI from 'openai';
const openai = new OpenAI();
import { autoAnalyzeObject, LLMAdapters } from 'wishful-search';
const GPTLLMAdapter = LLMAdapters.getOpenAIAdapter(openai, {
  model: 'gpt-4',
});
const results = await autoAnalyzeObject(
  movies[0],
  GPTLLMAdapter.callLLM,
  '~/tmp',
);
```

GPT-4 and Claude-2 perform similarly and are recommended.

`results` will contain the same info as an `analysis_{date}.md` file placed in the directory of your choice. The file should contain instructions, along with the structured DDL and the ObjectToRelational function. Make sure to read the code - if your objects are complex it might need some tweaking - before you use it!

Smart models can get you 99% of the way there in most cases, but some common things to look out for:

1. No dynamic enum settings in the structured DDL - you may not need these, but GPT-4 finds it hard to recommend any.
2. No default values in case your objects are sometimes missing fields. We generate the entire thing from a single object, so the model simply doesn't know which fields are missing or optional. Providing your own typespec as a parameter should fix this.

### Create

Once you have these, you can create a new WishfulSearch instance:

```typescript
const wishfulSearchEngine = await WishfulSearchEngine.create(
    'flights', // Name for your search instance, for labelling
    MOVIES_DDL, // Structured DDL
    {
      table: 'Movies', // Primary table
      column: 'id', // Primary id column
    },
    movieToRows, // Object to relational function
    {
      enableTodaysDate: true, // Inform the model about the date
      fewShotLearning: [], // Few-shot examples
    },
    GPT4LLMAdapter.callLLM, // LLM calling function
    (movie: Movie) => movie.id, // Object to id function
    true, // Save question history?
    true, // Enable dynamic enums on insert?
    true // Sort dynamic enums by frequency? Light performance penalty on insert but better searches and token savings
  	undefined // sql.js wasm URL
  );
```

### Insert

You can insert your objects into the instance by simply passing them in:

```typescript
const errors = wishfulSearchEngine.insert(TEST_MOVIES);
```

In this case, any insertion errors are passed back to you as an array. If you enable the second parameter, all insertion is rolled back when an error is encountered, and an exception is thrown.

### AI Few-shot generation

Use larger models to teach smaller models how to behave in a few lines! Import a smarter model adapter (see above) and pass it into `autoGenerateFewShot`.

```typescript
await wishfulSearchEngine.autoGenerateFewShot(
  SmarterLLMAdapter.callLLM,
  [
    {
      question: 'something romantic?',
    },
    {
      question: 'from the 80s?',
    },
    {
      question: 'okay sci-fi instead.',
      clearHistory: true,
    },
  ],
  false, // Should we remove questions that don't get results?
  false, // throw an error on invalid questions
  true, // Be verbose
);
```

`clearHistory` is recommended in between, to teach the model when to reset the filters based on user questions.

The function also returns the same format of question-answers used to create the instance, so you can save or edit it - or mix and match with generations from different models!

### Search

This is the easy bit.

```typescript
const results = (await wishfulSearchEngine.search(
  'Something romantic but not very short from the 80s',
)) as Movie[];
```

# Example: Movies

The demo shows filters in the [Kaggle movies](https://www.kaggle.com/datasets/rounakbanik/the-movies-dataset/) dataset.

To use:

1. Download `movies_metadata.csv`.
2. Place it in `tests/data`.
3. Run `tests/movies.run.ts` with `npx ts-node tests/movies.run.ts`.

You can uncomment the different adapters for GPT, Claude, Mistral. Comment and uncomment the few-shot generation to see how behavior changes. Have fun!

# How it works

A few things happen in order to perform a search:

1. The JSON objects are converted to relational tables with foreign-keys and stored in the embedded sqlite db.
2. Dynamic enum values are generated to help inform the LLM about the contents of each relevant column.
3. User queries are translated into complete context, including table structure, contents, past questions, and passed to the LLM to generate a SQL query that retrieves the relevant ids.
4. Results of the query are (optionally) used to retrieve the relevant object and returned to the caller.

## Other utilities

- `llm-adapters.ts` exposes the templating functions for each model.
- `WishfulSearchEngine` exposes the following additional functions:
  - `generateSearchMessages` returns (in OpenAI message format) the messages that go to the LLM to generate the query.
  - `searchWithPartialQuery` can be used to perform the search with the query response you get from the LLM.

## Where are the prompts?

I tend to read repos prompt first. In this case, most of the complexity is in formatting the output and injecting things at the right time, but if you'd like to do the same, here are the prompts for [AI Quickstart](/src/auto-analyze.ts) and for [Search](/src/magic-search.ts).

# TODO

- [ ] Tests

  More robust tests are needed before production usage. Unfortunately that's outside my scope at the moment, but I'll update the repo if I get around to it! Help would be appreciated.

- [ ] Client-side testing

  The client-side bundle has been tested in a limited fashion. It's hard to keep running all the toolchains without automated testing for now. If you run into any issues, let me know.

