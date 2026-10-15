<?php
/**
 * PHP parity for the TypeScript token set corpus.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Tokens\TokenSet;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();

/** Proves every shared corpus outcome, including order, paths and both modes. */
final class TokenSetCorpusTest extends TestCase {
	/** PHP shape limits count UTF-16 units, matching TypeScript's string length. */
	public function test_unicode_label_length(): void {
		$set = (object) [
			'schemaVersion' => 1,
			'tokenVersion'  => 0,
			'tokens'        => [
				(object) [
					'name'     => 'accent',
					'category' => 'color',
					'value'    => 'red',
					'label'    => '',
				],
			],
		];
		foreach ( [ 50, 51, 80 ] as $length ) {
			$set->tokens[0]->label = \str_repeat( 'é', $length );
			$this->assertTrue( TokenSet::validateTokenSet( $set )['ok'], (string) $length );
		}
		$set->tokens[0]->label = \str_repeat( 'é', 81 );
		$invalid               = TokenSet::validateTokenSet( $set );
		$this->assertFalse( $invalid['ok'] );
		$this->assertSame(
			[
				'code' => 'schema',
				'path' => '$.tokens.0.label',
			],
			$invalid['issues'][0]
		);
		$set->tokens[0]->label = \str_repeat( '😀', 40 );
		$this->assertTrue( TokenSet::validateTokenSet( $set )['ok'] );
		$set->tokens[0]->label = \str_repeat( '😀', 41 );
		$invalid               = TokenSet::validateTokenSet( $set );
		$this->assertFalse( $invalid['ok'] );
		$this->assertSame(
			[
				'code' => 'schema',
				'path' => '$.tokens.0.label',
			],
			$invalid['issues'][0]
		);
	}

	/** Expanded token values use the same UTF-16 ceiling as the TypeScript resolver. */
	public function test_unicode_expansion_length(): void {
		$set = (object) [
			'tokens' => [
				(object) [
					'name'  => 'emoji',
					'value' => \str_repeat( '😀', 4096 ),
				],
			],
		];
		$this->assertSame( [], TokenSet::resolveTokens( $set, 'light' )['issues'] );
		$set->tokens[0]->value .= '😀';
		$this->assertSame(
			[
				[
					'code' => 'expansion-too-large',
					'path' => 'tokens[0].value',
				],
			],
			TokenSet::resolveTokens( $set, 'light' )['issues']
		);
	}

	/** A wide shared-reference graph resolves quickly in each mode. */
	public function test_shared_reference_resolution_is_memoized(): void {
		$tokens = [
			(object) [
				'name'  => 'base',
				'value' => 'red',
			],
		];
		for ( $layer = 1; $layer <= 9; ++$layer ) {
			$previous = 1 === $layer ? 'base' : 'layer-' . ( $layer - 1 );
			$tokens[] = (object) [
				'name'  => 'layer-' . $layer,
				'value' => 'var(--blx-' . $previous . ') var(--blx-' . $previous . ')',
			];
		}
		for ( $i = 0; $i < 490; ++$i ) {
			$tokens[] = (object) [
				'name'  => 'leaf-' . $i,
				'value' => 'var(--blx-layer-9)',
			];
		}
		$set   = (object) [ 'tokens' => $tokens ];
		$start = \microtime( true );
		foreach ( [ 'light', 'dark' ] as $mode ) {
			$result = TokenSet::resolveTokens( $set, $mode );
			$this->assertSame( [], $result['issues'] );
			$this->assertCount( 500, $result['values'] );
		}
		$this->assertLessThan( 1.0, \microtime( true ) - $start );
	}
	/**
	 * Shared cases.
	 *
	 * @return array<string,array{\stdClass}>
	 */
	public static function cases(): array {
		$path = \dirname( __DIR__, 3 ) . '/packages/style-engine/corpus/token-sets.json';
		$data = \json_decode( (string) \file_get_contents( $path ), false, 128, JSON_THROW_ON_ERROR ); // phpcs:ignore WordPress.WP.AlternativeFunctions -- Test fixture.
		$out  = [];
		foreach ( $data->cases as $case ) {
			$out[ $case->id ] = [ $case ];
		}
		return $out;
	}

	/**
	 * Verify the entire corpus contract.
	 *
	 * @param \stdClass $fixture_case Case.
	 */
	#[DataProvider( 'cases' )]
	public function test_token_set_corpus( \stdClass $fixture_case ): void {
		$result = TokenSet::validateTokenSet( $fixture_case->input );
		$this->assertSame( $fixture_case->expect->ok, $result['ok'], $fixture_case->id );
		if ( ! $result['ok'] ) {
			$expected = \array_map(
				static fn ( \stdClass $issue ): array => [
					'code' => $issue->code,
					'path' => $issue->path,
				],
				$fixture_case->expect->issues
			);
			$this->assertSame( $expected, $result['issues'], $fixture_case->id );
			return;
		}
		$this->assertEquals( (array) $fixture_case->expect->light, TokenSet::resolveTokens( $result['set'], 'light' )['values'], $fixture_case->id );
		$this->assertEquals( (array) $fixture_case->expect->dark, TokenSet::resolveTokens( $result['set'], 'dark' )['values'], $fixture_case->id );
		$this->assertEquals( \array_map( static fn ( \stdClass $token ): array => (array) $token, $fixture_case->expect->compile ), TokenSet::tokensForCompile( $result['set'] ), $fixture_case->id );
	}
}
