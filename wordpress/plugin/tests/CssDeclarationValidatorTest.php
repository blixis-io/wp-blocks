<?php
/**
 * CssDeclarationValidatorTest implementation.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Css\DeclarationValidator;
use Blixis\Builder\Css\Properties;
use Blixis\Builder\Css\Tokenizer;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); } // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();

/** Shared CSS validator contract tests. */
final class CssDeclarationValidatorTest extends TestCase {
	/**
	 * Test declaration corpus.
	 */
	public function test_declaration_corpus(): void {
		$path   = \dirname( __DIR__, 3 ) . '/packages/style-engine/corpus/declarations.json';
		$corpus = \json_decode( (string) \file_get_contents( $path ), true, 512, JSON_THROW_ON_ERROR ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Fixture.
		foreach ( $corpus['valid'] as $case ) {
			$result = DeclarationValidator::validate( $case['name'], $case['value'] );
			$this->assertTrue( $result->ok, $case['name'] . ': ' . (string) $case['value'] . ' (' . $result->code . ')' );
			$this->assertSame( $case['normalized'], $result->value );
			$again = DeclarationValidator::validate( $case['name'], $result->value );
			$this->assertTrue( $again->ok );
			$this->assertSame( $result->value, $again->value );
		}
		foreach ( $corpus['invalid'] as $case ) {
			$result = DeclarationValidator::validate( $case['name'], $case['value'] );
			$this->assertFalse( $result->ok, $case['name'] . ': ' . $case['value'] );
			$this->assertSame( $case['code'], $result->code, $case['name'] . ': ' . $case['value'] );
		}
	}

	/**
	 * Test properties manifest.
	 */
	public function test_properties_manifest(): void {
		$source = \file_get_contents( \dirname( __DIR__, 3 ) . '/packages/style-engine/manifest/css-properties.json' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Fixture.
		$copy   = \file_get_contents( \dirname( __DIR__ ) . '/data/css-properties.json' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Bundled data.
		$this->assertSame( $source, $copy );
		$manifest = Properties::manifest();
		foreach ( \array_keys( $manifest['properties'] ) as $name ) {
			$this->assertTrue( DeclarationValidator::validate( (string) $name, 'inherit' )->ok );
			$this->assertFalse( DeclarationValidator::validate( (string) $name, 'url(x)' )->ok ); }
	}

	/**
	 * Test forbidden characters and limits.
	 */
	public function test_forbidden_characters_and_limits(): void {
		foreach ( Tokenizer::FORBIDDEN as $char ) {
			$this->assertSame( 'forbidden-character', DeclarationValidator::validate( 'color', 'red' . $char )->code ); }
		foreach ( [ "\0", "\n", "\x80", "\xed\xa0\x80", "\xc3\xa9" ] as $char ) {
			$this->assertSame( 'forbidden-character', DeclarationValidator::validate( 'color', 'red' . $char )->code ); }
		$this->assertSame( 'forbidden-character', DeclarationValidator::validate( 'color', \str_repeat( "\xc3\xa9", 1025 ) )->code );
		$this->assertSame( 'value-too-long', DeclarationValidator::validate( 'color', \str_repeat( "\xc3\xa9", 2049 ) )->code );
		$this->assertSame( 'value-too-long', DeclarationValidator::validate( 'color', \str_repeat( 'x', 2049 ) )->code );
		$this->assertSame( 'too-complex', DeclarationValidator::validate( 'width', \str_repeat( 'calc(', 9 ) . '1px' . \str_repeat( ')', 9 ) )->code );
		$this->assertSame( 'syntax', DeclarationValidator::validate( 'width', \str_repeat( '9', 11 ) . 'px' )->code );
		$this->assertSame( 'too-complex', DeclarationValidator::validate( 'color', \str_repeat( 'red ', 130 ) )->code );
	}

	/**
	 * Test sanitize orders and reports.
	 */
	public function test_sanitize_orders_and_reports(): void {
		$result = DeclarationValidator::sanitize(
			[
				'z-index'  => 2,
				'color'    => 'RED',
				'behavior' => 'url(x)',
				'width'    => '+4px',
			]
		);
		$this->assertSame(
			[
				'color'   => 'red',
				'width'   => '4px',
				'z-index' => '2',
			],
			$result['declarations']
		);
		$this->assertSame( 'behavior', $result['issues'][0]['name'] );
		$this->assertSame( 'unknown-property', $result['issues'][0]['code'] );
	}

	/**
	 * Test seeded fuzz.
	 */
	public function test_seeded_fuzz(): void {
		$pieces = [ 'red', '#fff', '0', '1px', '50%', 'none', 'calc(', 'rgb(', 'var(--blx-a', 'var(--evil', 'url(', ')', ',', '/', '*', '+', '-', ' ', ';', '{', '}', '\\', '"', '@', 'expression(', ':', "\xed\xa0\x80" ];
		$names  = [ 'color', 'width', 'border', 'transform', 'font-family', '--blx-a', '--evil', 'behavior' ];
		\mt_srand( 20261014 );
		$accepted = 0;
		for ( $n = 0; $n < 4000; ++$n ) {
			$value = '';
			$count = \mt_rand( 1, 8 ); for ( $i = 0; $i < $count; ++$i ) {
				$value .= $pieces[ \mt_rand( 0, \count( $pieces ) - 1 ) ]; }
			$name   = $names[ \mt_rand( 0, \count( $names ) - 1 ) ];
			$result = DeclarationValidator::validate( $name, $value );
			if ( ! $result->ok ) {
				continue;
			} ++$accepted;
			$this->assertSame( 0, \preg_match( '/url\s*\(|expression|[@;{}\\\\:<>' . "'" . ']|--(?!blx-)/i', $result->value ) );
			$this->assertSame( $result->value, DeclarationValidator::validate( $name, $result->value )->value );
		}
		$this->assertGreaterThan( 20, $accepted );
	}
}
