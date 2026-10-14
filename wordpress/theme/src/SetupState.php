<?php
/**
 * Site setup status and per-user wizard position.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme;

\defined( 'ABSPATH' ) || exit;

/**
 * Keeps site setup data separate from each user's wizard interface state.
 */
final class SetupState {

	public const OPTION    = 'blixis_setup';
	public const USER_META = 'blixis_setup_ui';
	public const VERSION   = 1;

	/**
	 * Validate a stored site status without calling WordPress.
	 *
	 * @param mixed $value Stored value.
	 * @return array{version: 1, status: string, updated_at: string, preset?: string}|null
	 */
	public static function normalize( mixed $value ): ?array {
		if ( ! is_array( $value ) || array_diff( array_keys( $value ), array( 'version', 'status', 'updated_at', 'preset' ) ) || self::VERSION !== ( $value['version'] ?? null ) || ! is_string( $value['status'] ?? null ) || ! in_array( $value['status'], array( 'not_started', 'in_progress', 'completed', 'dismissed' ), true ) || ! is_string( $value['updated_at'] ?? null ) ) {
			return null;
		}
		$date = \DateTimeImmutable::createFromFormat( DATE_ATOM, $value['updated_at'] );
		if ( false === $date || $date->format( DATE_ATOM ) !== $value['updated_at'] ) {
			return null;
		}
		$state = array(
			'version'    => self::VERSION,
			'status'     => $value['status'],
			'updated_at' => $value['updated_at'],
		);
		if ( array_key_exists( 'preset', $value ) ) {
			if ( ! is_string( $value['preset'] ) || 1 !== preg_match( '/^[a-z][a-z0-9-]{0,63}$/', $value['preset'] ) ) {
				return null;
			}
			$state['preset'] = $value['preset'];
		}
		return $state;
	}

	/**
	 * Initial status for a newly activated site.
	 *
	 * @param string $updated_at UTC RFC3339 timestamp.
	 * @return array{version: 1, status: string, updated_at: string}
	 */
	public static function initial( string $updated_at ): array {
		return array(
			'version'    => self::VERSION,
			'status'     => 'not_started',
			'updated_at' => $updated_at,
		);
	}

	/**
	 * Apply an entry-point action to a valid status. Completed and dismissed setups remain untouched.
	 *
	 * @param mixed  $value      Stored status.
	 * @param string $action     start or dismiss.
	 * @param string $updated_at UTC RFC3339 timestamp.
	 * @return array{version: 1, status: string, updated_at: string, preset?: string}|null
	 */
	public static function transition( mixed $value, string $action, string $updated_at ): ?array {
		$state = self::normalize( $value );
		if ( null === $state || ! in_array( $state['status'], array( 'not_started', 'in_progress' ), true ) ) {
			return null;
		}
		if ( 'start' === $action ) {
			if ( 'in_progress' === $state['status'] ) {
				return $state;
			}
			$state['status'] = 'in_progress';
		} elseif ( 'dismiss' === $action ) {
			$state['status'] = 'dismissed';
		} else {
			return null;
		}
		$state['updated_at'] = $updated_at;
		return null === self::normalize( $state ) ? null : $state;
	}

	/**
	 * Read the current site's setup status. Invalid and future versions remain stored but are not acted on.
	 *
	 * @return array{version: 1, status: string, updated_at: string, preset?: string}|null
	 */
	public static function get(): ?array {
		return self::normalize( get_option( self::OPTION, false ) );
	}

	/**
	 * Initialize once for the current site. add_option prevents reactivation from replacing any existing value.
	 *
	 * @return void
	 */
	public static function activate(): void {
		add_option( self::OPTION, self::initial( gmdate( DATE_ATOM ) ), '', false );
	}

	/**
	 * Validate the per-user wizard position without calling WordPress.
	 *
	 * @param mixed $value Stored user meta.
	 * @return array{resume_step: int}|null
	 */
	public static function normalize_ui( mixed $value ): ?array {
		if ( ! is_array( $value ) || array_keys( $value ) !== array( 'resume_step' ) || ! is_int( $value['resume_step'] ) || $value['resume_step'] < 1 || $value['resume_step'] > 6 ) {
			return null;
		}
		return array( 'resume_step' => $value['resume_step'] );
	}

	/**
	 * Resolve a wizard navigation action without WordPress state.
	 *
	 * @param int    $step Current step.
	 * @param string $direction Back or next.
	 * @return int|null Destination, or null for an invalid transition.
	 */
	public static function next_step( int $step, string $direction ): ?int {
		if ( $step < 1 || $step > 6 ) {
			return null;
		}
		if ( 'back' === $direction && $step > 1 ) {
			return $step - 1;
		}
		if ( 'next' === $direction && $step < 6 ) {
			return $step + 1;
		}
		return null;
	}

	/**
	 * Read a user's resume step. Invalid data starts at the first step.
	 *
	 * @param int $user_id WordPress user ID.
	 * @return int
	 */
	public static function resume_step( int $user_id ): int {
		$value = self::normalize_ui( get_user_meta( $user_id, self::USER_META, true ) );
		return null === $value ? 1 : $value['resume_step'];
	}

	/**
	 * Store the current user's wizard step without changing site status.
	 *
	 * @param int $user_id WordPress user ID.
	 * @param int $step    Step number, 1 through 6.
	 * @return bool Whether a valid step was accepted.
	 */
	public static function save_resume_step( int $user_id, int $step ): bool {
		if ( $user_id <= 0 || $step < 1 || $step > 6 ) {
			return false;
		}
		update_user_meta( $user_id, self::USER_META, array( 'resume_step' => $step ) );
		return true;
	}
}
