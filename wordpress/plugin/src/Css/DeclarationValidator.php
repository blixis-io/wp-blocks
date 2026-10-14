<?php
/**
 * DeclarationValidator implementation.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Css;

/** DeclarationValidator contract. */
final class DeclarationValidator {
	/**
	 * Validate.
	 *
	 * @param string     $name Name.
	 * @param string|int $value Value.
	 */
	public static function validate( string $name, string|int $value ): DeclarationResult {
		$text   = \is_int( $value ) ? ( \abs( (float) $value ) <= 9007199254740991 ? (string) $value : '' ) : $value;
		$custom = \str_starts_with( $name, '--' );
		$kind   = Properties::kind( $name );
		if ( ( $custom && 1 !== \preg_match( '/^--blx-[a-z0-9-]{1,64}$/D', $name ) ) || ( ! $custom && null === $kind ) ) {
			return DeclarationResult::failure( $custom ? 'invalid-name' : 'unknown-property', $custom ? 'custom properties must be named --blx-*' : '"' . $name . '" is not an allowed CSS property' );
		}
		if ( '' === \trim( $text ) ) {
			return DeclarationResult::failure( 'empty-value', 'the value is empty' ); }
		$parsed = Tokenizer::parse( $text, 'font-family' === $name || $custom );
		if ( ! $parsed['ok'] ) {
			return DeclarationResult::failure( $parsed['code'], $parsed['message'] ); }
		$items   = $parsed['components'];
		$failure = Grammar::check_functions( $items );
		if ( null === $failure && $custom ) {
			$failure = Grammar::check_custom( $items ); }
		if ( null !== $failure ) {
			return DeclarationResult::failure( $failure['code'], $failure['message'] ); }
		if ( ! $custom && ! Grammar::matches_property( $kind, $items ) ) {
			return DeclarationResult::failure( 'invalid-value', '"' . \substr( $text, 0, 80 ) . '" is not a valid value for ' . $name ); }
		return new DeclarationResult( true, $name, Tokenizer::serialize( $items ) );
	}
	/**
	 * Sanitize.
	 *
	 * @param array<string, string|int> $declarations Declarations.
	 * @return array{declarations: array<string, string>, issues: list<array{name: string, code: string, message: string}>}
	 */
	public static function sanitize( array $declarations ): array {
		\ksort( $declarations, SORT_STRING );
		$clean  = [];
		$issues = [];
		foreach ( $declarations as $name => $raw ) {
			$result = self::validate( (string) $name, $raw );
			if ( $result->ok ) {
				$clean[ $name ] = $result->value; } else {
				$issues[] = [
					'name'    => (string) $name,
					'code'    => $result->code,
					'message' => $result->message,
				]; }
		}
		return [
			'declarations' => $clean,
			'issues'       => $issues,
		];
	}
}
