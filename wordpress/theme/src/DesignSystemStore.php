<?php
/**
 * Design system persistence: save, history, rollback and the CSS the front end prints (BWB-035).
 *
 * The site's design system is ONE versioned option (`blixis_design_system`), autoloaded because every public page needs it,
 * plus a short history option (`blixis_design_system_history`, not autoloaded) for rollback. Tokens are live site-wide
 * appearance (ADR 0004): saving or rolling back changes every page, and `tokenVersion` only invalidates caches. The pure
 * methods (normalize, next_state, push_history, rollback_plan, css) need no WordPress and are unit tested; the wrappers
 * add the option reads and writes.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme;

\defined( 'ABSPATH' ) || exit;

/**
 * Persists the validated design system.
 */
final class DesignSystemStore {

	/**
	 * Option holding the current design system.
	 */
	public const OPTION = 'blixis_design_system';

	/**
	 * Option holding earlier versions, newest first.
	 */
	public const HISTORY_OPTION = 'blixis_design_system_history';

	/**
	 * Number of earlier versions kept for rollback.
	 */
	public const MAX_HISTORY = 5;

	/**
	 * Allowed characters of a value that is printed into a stylesheet: hex colors, lengths, font stacks and shadows. No
	 * angle brackets, semicolons, braces, backslashes or url(): nothing that could end a declaration or a style element.
	 */
	private const SAFE_VALUE = '/^[A-Za-z0-9#%.,()\/ \'"\-]{1,200}$/';

	/**
	 * Validate a stored state. Corrupted or unknown data is rejected, never repaired.
	 *
	 * @param mixed                $value Stored value.
	 * @param array<string, mixed> $seed  Default token set (the allowed names and option lists).
	 * @return array{version: 1, tokenVersion: int, preset: string, updated_at: string, tokens: array<string, mixed>}|null
	 */
	public static function normalize( mixed $value, array $seed ): ?array {
		if ( ! \is_array( $value ) || 1 !== ( $value['version'] ?? null ) || ! \is_int( $value['tokenVersion'] ?? null ) || $value['tokenVersion'] < 1 ) {
			return null;
		}
		if ( ! \is_string( $value['preset'] ?? null ) || 1 !== \preg_match( '/^[a-z][a-z0-9-]{0,31}$/', $value['preset'] ) ) {
			return null;
		}
		if ( ! \is_string( $value['updated_at'] ?? null ) || ! \is_array( $value['tokens'] ?? null ) || array() !== TokenDraft::validate( $value['tokens'], $seed ) ) {
			return null;
		}
		return array(
			'version'      => 1,
			'tokenVersion' => $value['tokenVersion'],
			'preset'       => $value['preset'],
			'updated_at'   => $value['updated_at'],
			'tokens'       => $value['tokens'],
		);
	}

	/**
	 * The state that saving produces: the version always moves forward.
	 *
	 * @param array{tokenVersion: int}|null $current    Current state.
	 * @param array<string, mixed>          $tokens     Validated tokens.
	 * @param string                        $preset     Preset the draft started from.
	 * @param string                        $updated_at UTC timestamp.
	 * @return array{version: 1, tokenVersion: int, preset: string, updated_at: string, tokens: array<string, mixed>}
	 */
	public static function next_state( ?array $current, array $tokens, string $preset, string $updated_at ): array {
		return array(
			'version'      => 1,
			'tokenVersion' => null === $current ? 1 : $current['tokenVersion'] + 1,
			'preset'       => $preset,
			'updated_at'   => $updated_at,
			'tokens'       => $tokens,
		);
	}

	/**
	 * Put the replaced state at the front of the history and drop the oldest beyond the limit.
	 *
	 * @param list<array<string, mixed>> $history Earlier states, newest first.
	 * @param array<string, mixed>|null  $current The state being replaced.
	 * @return list<array<string, mixed>>
	 */
	public static function push_history( array $history, ?array $current ): array {
		if ( null !== $current ) {
			\array_unshift( $history, $current );
		}
		return \array_slice( \array_values( $history ), 0, self::MAX_HISTORY );
	}

	/**
	 * Plan a rollback to the newest earlier state. The restored content gets a new, higher token version (versions never go
	 * back, so caches keyed on it are invalidated), and the state it replaces is not kept: a second rollback goes one step
	 * further back.
	 *
	 * @param array{tokenVersion: int}|null $current    Current state.
	 * @param list<array<string, mixed>>    $history    Earlier states, newest first.
	 * @param string                        $updated_at UTC timestamp.
	 * @return array{state: array<string, mixed>, history: list<array<string, mixed>>}|null Null when there is nothing to restore.
	 */
	public static function rollback_plan( ?array $current, array $history, string $updated_at ): ?array {
		if ( null === $current || array() === $history ) {
			return null;
		}
		$restored                 = \array_shift( $history );
		$restored['tokenVersion'] = $current['tokenVersion'] + 1;
		$restored['updated_at']   = $updated_at;
		return array(
			'state'   => $restored,
			'history' => \array_values( $history ),
		);
	}

	/**
	 * The stylesheet for a token set, in the form the compiler emits for tokens (layer `blx.tokens`): base values on the root,
	 * dark overrides for an explicit `data-theme="dark"` and for `auto` with a dark system preference. A dark value equal to
	 * the base value is not emitted (modes are sparse). Values outside the safe character set are skipped.
	 *
	 * @param array<string, mixed> $tokens Validated tokens (`name => {value, dark?}`).
	 * @return string CSS, or an empty string when there is nothing to print.
	 */
	public static function css( array $tokens ): string {
		\ksort( $tokens );
		$base = '';
		$dark = '';
		foreach ( $tokens as $name => $token ) {
			if ( 1 !== \preg_match( '/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/', (string) $name ) || ! \is_array( $token ) || ! \is_string( $token['value'] ?? null ) || 1 !== \preg_match( self::SAFE_VALUE, $token['value'] ) ) {
				continue;
			}
			$base .= '--blx-' . $name . ':' . $token['value'] . ';';
			$mode  = $token['dark'] ?? null;
			if ( \is_string( $mode ) && $mode !== $token['value'] && 1 === \preg_match( self::SAFE_VALUE, $mode ) ) {
				$dark .= '--blx-' . $name . ':' . $mode . ';';
			}
		}
		if ( '' === $base ) {
			return '';
		}
		$css = ':where(:root){' . \rtrim( $base, ';' ) . '}';
		if ( '' !== $dark ) {
			$dark = '{' . \rtrim( $dark, ';' ) . '}';
			$css .= ':where(html[data-theme="dark"])' . $dark . '@media (prefers-color-scheme:dark){:where(html:not([data-theme="light"]):not([data-theme="dark"]))' . $dark . '}';
		}
		return '@layer blx.tokens{' . $css . '}';
	}

	/**
	 * Default token set used to validate stored data.
	 *
	 * @return array<string, mixed>|null
	 */
	private static function seed(): ?array {
		return TokenDraft::seed( get_template_directory() . '/design/default-tokens.json', 'custom' );
	}

	/**
	 * The saved design system, or null when none was saved or the stored data is invalid.
	 *
	 * @return array{version: 1, tokenVersion: int, preset: string, updated_at: string, tokens: array<string, mixed>}|null
	 */
	public static function current(): ?array {
		$seed = self::seed();
		return null === $seed ? null : self::normalize( get_option( self::OPTION, false ), $seed );
	}

	/**
	 * Earlier versions, newest first; invalid entries are dropped.
	 *
	 * @return list<array{version: 1, tokenVersion: int, preset: string, updated_at: string, tokens: array<string, mixed>}>
	 */
	public static function history(): array {
		$seed = self::seed();
		$raw  = get_option( self::HISTORY_OPTION, array() );
		if ( null === $seed || ! \is_array( $raw ) ) {
			return array();
		}
		$out = array();
		foreach ( $raw as $entry ) {
			$state = self::normalize( $entry, $seed );
			if ( null !== $state ) {
				$out[] = $state;
			}
		}
		return \array_slice( $out, 0, self::MAX_HISTORY );
	}

	/**
	 * Save a validated design system. The current option is the source of truth: the history is written first (a failure
	 * between the two writes leaves a harmless duplicate), and success is reported only after the current option was written.
	 *
	 * @param array<string, mixed> $tokens Validated draft tokens.
	 * @param string               $preset Preset the draft started from.
	 * @return array{ok: true, tokenVersion: int}|array{ok: false, reason: string}
	 */
	public static function apply( array $tokens, string $preset = 'custom' ): array {
		$seed = self::seed();
		if ( null === $seed || array() !== TokenDraft::validate( $tokens, $seed ) ) {
			return array(
				'ok'     => false,
				'reason' => 'invalid',
			);
		}
		$current = self::current();
		$state   = self::next_state( $current, $tokens, $preset, gmdate( DATE_ATOM ) );
		update_option( self::HISTORY_OPTION, self::push_history( self::history(), $current ), false );
		if ( ! update_option( self::OPTION, $state, true ) ) {
			return array(
				'ok'     => false,
				'reason' => 'not-saved',
			);
		}
		return array(
			'ok'           => true,
			'tokenVersion' => $state['tokenVersion'],
		);
	}

	/**
	 * Restore the newest earlier version.
	 *
	 * @return array{ok: true, tokenVersion: int}|array{ok: false, reason: string}
	 */
	public static function rollback(): array {
		$plan = self::rollback_plan( self::current(), self::history(), gmdate( DATE_ATOM ) );
		if ( null === $plan ) {
			return array(
				'ok'     => false,
				'reason' => 'nothing-to-restore',
			);
		}
		if ( ! update_option( self::OPTION, $plan['state'], true ) ) {
			return array(
				'ok'     => false,
				'reason' => 'not-saved',
			);
		}
		update_option( self::HISTORY_OPTION, $plan['history'], false );
		return array(
			'ok'           => true,
			'tokenVersion' => (int) $plan['state']['tokenVersion'],
		);
	}
}
